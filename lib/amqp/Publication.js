var debug = require('debug')('rascal:Publication');
var EventEmitter = require('events');
var format = require('util').format;
var _ = require('lodash');
var uuid = require('uuid').v4;
var crypto = require('crypto');
var PublicationSession = require('./PublicationSession');
var setTimeoutUnref = require('../utils/setTimeoutUnref');

module.exports = {
  create: function(vhost, config, next) {
    var borrowConfirmChannel = vhost.borrowConfirmChannel.bind(vhost);
    var returnConfirmChannel = vhost.returnConfirmChannel.bind(vhost);
    var destroyConfirmChannel = vhost.destroyConfirmChannel.bind(vhost);
    var borrowChannel = vhost.borrowChannel.bind(vhost);
    var returnChannel = vhost.returnChannel.bind(vhost);
    var destroyChannel = vhost.destroyChannel.bind(vhost);

    if (config.hasOwnProperty('exchange') && config.confirm) return new Publication(vhost, borrowConfirmChannel, returnConfirmChannel, destroyConfirmChannel, publishToConfirmExchange, config).init(next);
    if (config.hasOwnProperty('exchange')) return new Publication(vhost, borrowChannel, returnChannel, destroyChannel, publishToExchange, config).init(next);
    if (config.queue && config.confirm) return new Publication(vhost, borrowConfirmChannel, returnConfirmChannel, destroyConfirmChannel, sendToConfirmQueue, config).init(next);
    if (config.queue) return new Publication(vhost, borrowChannel, returnChannel, destroyChannel, sendToQueue, config).init(next);
  },
};

function Publication(vhost, borrowChannelFn, returnChannelFn, destroyChannelFn, publishFn, config) {

  var self = this;

  this.name = config.name;

  this.init = function(next) {
    debug('Initialising publication: %s', config.name);
    next(null, self);
  };

  this.publish = function(payload, overrides, next) {
    var publishConfig = _.defaultsDeep({}, overrides, config);
    var content = getContent(payload, publishConfig);
    publishConfig.options.contentType = publishConfig.options.contentType || content.type;
    publishConfig.options.messageId = publishConfig.options.messageId || uuid();
    publishConfig.options.replyTo = config.directReplies ? 'amq.rabbitmq.reply-to' : undefined;

    const publishFn = publishConfig.encryption ? _publishEncrypted : _publish;

    publishFn(content.buffer, publishConfig, function(err, result) {
      if (err) return next(err);
      if (!config.directReplies) return next(null, result);
      enableReplies(result);
      return next(null, result);
    });

    function enableReplies(publication) {
      const { messageId } = publishConfig.options;
      const replyHandler = new EventEmitter();
      vhost.replyHandlers[messageId] = replyHandler;
      publication.replies = replyHandler;
      publication.replies.cancel = () => { delete vhost.replyHandlers[messageId]; };
    }
  };

  this.forward = function(message, overrides, next) {
    var originalQueue = message.properties.headers.rascal.originalQueue;
    var publishConfig = _.defaultsDeep({}, overrides, config, { routingKey: message.fields.routingKey });

    publishConfig.options = _.defaultsDeep(publishConfig.options, message.properties);

    _.set(publishConfig, 'options.headers.rascal.restoreRoutingHeaders', !!publishConfig.restoreRoutingHeaders);
    _.set(publishConfig, 'options.headers.rascal.originalExchange', message.fields.exchange);
    _.set(publishConfig, 'options.headers.rascal.originalRoutingKey', message.fields.routingKey);
    _.set(publishConfig, 'options.CC', _.chain([]).concat(publishConfig.options.CC, format('%s.%s', originalQueue, publishConfig.routingKey)).uniq().compact().value());

    _publish(message.content, publishConfig, next);
  };

  function _publishEncrypted(buffer, publishConfig, next) {
    var encryptionConfig = publishConfig.encryption;
    encrypt(encryptionConfig.algorithm, encryptionConfig.key, encryptionConfig.ivLength, buffer, function(err, iv, encrypted) {
      if (err) return next(err);
      debug('Message was encrypted using encryption profile: %s', encryptionConfig.name);
      _.set(publishConfig, 'options.headers.rascal.encryption.name', encryptionConfig.name);
      _.set(publishConfig, 'options.headers.rascal.encryption.iv', iv );
      _.set(publishConfig, 'options.headers.rascal.encryption.originalContentType', publishConfig.options.contentType);
      _.set(publishConfig, 'options.contentType', 'application/octet-stream');

      _publish(encrypted, publishConfig, next);
    });
  }

  function encrypt(algorithm, keyHex, ivLength, unencrypted, next) {
    crypto.randomBytes(ivLength, function(err, iv) {
      if (err) return next(err);
      var encrypted;
      try {
        var key = Buffer.from(keyHex, 'hex');
        var cipher = crypto.createCipheriv(algorithm, key, iv);
        encrypted = Buffer.concat([cipher.update(unencrypted), cipher.final()]);
      } catch (err) {
        return next(err);
      }
      next(null, iv.toString('hex'), encrypted);
    });
  }

  function _publish(buffer, publishConfig, next) {
    var messageId = publishConfig.options.messageId;
    var session = new PublicationSession(vhost, messageId);
    borrowChannelFn(function(err, channel) {
      session._removePausedListener();
      if (err) return session.emit('error', err, messageId);
      if (session.isAborted()) return abortPublish(channel, messageId);
      var errorHandler = _.once(handleChannelError.bind(null, channel, messageId, session, config));
      var returnHandler = session.emit.bind(session, 'return');
      addListeners(channel, errorHandler, returnHandler);
      try {
        session._startPublish();
        publishFn(channel, buffer, publishConfig, function(err, ok) {
          session._endPublish();
          if (err) {
            destroyChannel(channel, errorHandler, returnHandler);
            return session.emit('error', err, messageId);
          }

          ok ? returnChannel(channel, errorHandler, returnHandler)
             : deferReturnChannel(channel, errorHandler, returnHandler);

          session.emit('success', messageId);
        });
      } catch(err) {
        returnChannel(channel, errorHandler, returnHandler);
        return session.emit('error', err, messageId);
      };
    });

    next(null, session);
  }

  function abortPublish(channel, messageId) {
    debug('Publication of message: %s was aborted', messageId);
    returnChannelFn(channel);
  }

  function returnChannel(channel, errorHandler, returnHandler) {
    removeListeners(channel, errorHandler, returnHandler);
    returnChannelFn(channel);
  }

  function deferReturnChannel(channel, errorHandler, returnHandler) {
    channel.once('drain', function() {
      returnChannel(channel, errorHandler, returnHandler);
    });
  }

  function destroyChannel(channel, errorHandler, returnHandler) {
    removeListeners(channel, errorHandler, returnHandler);
    destroyChannelFn(channel);
  }

  function getContent(payload, config) {
    if (Buffer.isBuffer(payload)) return bufferMessage(payload);
    if (_.isString(payload)) return textMessage(payload);
    return jsonMessage(payload);
  }

  function bufferMessage(payload) {
    return { buffer: payload, type: undefined };
  }

  function textMessage(payload) {
    return { buffer: Buffer.from(payload), type : 'text/plain' };
  }

  function jsonMessage(payload) {
    return { buffer: Buffer.from(JSON.stringify(payload)), type: 'application/json' };
  }
}

function addListeners(channel, errorHandler, returnHandler) {
  channel.once('error', errorHandler);
  channel.on('return', returnHandler);
  channel.connection.once('error', errorHandler);
  channel.connection.once('close', errorHandler);
}

function removeListeners(channel, errorHandler, returnHandler) {
  channel.removeListener('error', errorHandler);
  channel.removeListener('return', returnHandler);
  channel.connection.removeListener('error', errorHandler);
  channel.connection.removeListener('close', errorHandler);
}

function publishToExchange(channel, content, config, next) {
  debug('Publishing %d bytes to exchange: %s with routingKeys: %s', content.length, config.exchange, _.compact([].concat(config.routingKey, config.options.CC, config.options.BCC)).join(', '));
  var ok = channel.publish(config.destination, config.routingKey, content, config.options);
  next(null, ok);
}

function publishToConfirmExchange(channel, content, config, next) {
  debug('Publishing %d bytes to confirm exchange: %s with routingKeys: %s', content.length, config.exchange, _.compact([].concat(config.routingKey, config.options.CC, config.options.BCC)).join(', '));

  var once = _.once(next);
  var timeout = config.timeout ? setConfirmationTimeout(config.timeout, config.destination, once) : null;

  var ok = channel.publish(config.destination, config.routingKey, content, config.options, function(err) {
    clearTimeout(timeout);
    once(err, ok);
  });
}

function sendToQueue(channel, content, config, next) {
  debug('Publishing %d bytes to queue: %s', content.length, config.queue);
  var ok = channel.sendToQueue(config.destination, content, config.options);
  next(null, ok);
}

function sendToConfirmQueue(channel, content, config, next) {
  debug('Publishing %d bytes to queue: %s', content.length, config.queue);

  var once = _.once(next);
  var timeout = config.timeout ? setConfirmationTimeout(config.timeout, config.destination, once) : null;

  var ok = channel.sendToQueue(config.destination, content, config.options, function(err) {
    clearTimeout(timeout);
    next(err, ok);
  });
}

function setConfirmationTimeout(timeout, destination, next) {
  return setTimeoutUnref(function() {
    next(new Error(format('Timedout after %dms waiting for broker to confirm publication to: %s', timeout, destination)));
  }, timeout);
}

function handleChannelError(borked, messageId, emitter, config, err) {
  debug('Channel error: %s during publication of message: %s to %s using channel: %s', err.message, messageId, config.name, borked._rascal_id);
  emitter.emit('error', err, messageId);
}
