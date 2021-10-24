const debug = require('debug')('rascal:Publication');
const format = require('util').format;
const _ = require('lodash');
const uuid = require('uuid').v4;
const crypto = require('crypto');
const PublicationSession = require('./PublicationSession');
const setTimeoutUnref = require('../utils/setTimeoutUnref');

module.exports = {
  create(vhost, config, next) {
    const borrowConfirmChannel = vhost.borrowConfirmChannel.bind(vhost);
    const returnConfirmChannel = vhost.returnConfirmChannel.bind(vhost);
    const destroyConfirmChannel = vhost.destroyConfirmChannel.bind(vhost);
    const borrowChannel = vhost.borrowChannel.bind(vhost);
    const returnChannel = vhost.returnChannel.bind(vhost);
    const destroyChannel = vhost.destroyChannel.bind(vhost);

    if (Object.prototype.hasOwnProperty.call(config, 'exchange') && config.confirm) return new Publication(vhost, borrowConfirmChannel, returnConfirmChannel, destroyConfirmChannel, publishToConfirmExchange, config).init(next);
    if (Object.prototype.hasOwnProperty.call(config, 'exchange')) return new Publication(vhost, borrowChannel, returnChannel, destroyChannel, publishToExchange, config).init(next);
    if (config.queue && config.confirm) return new Publication(vhost, borrowConfirmChannel, returnConfirmChannel, destroyConfirmChannel, sendToConfirmQueue, config).init(next);
    if (config.queue) return new Publication(vhost, borrowChannel, returnChannel, destroyChannel, sendToQueue, config).init(next);
  },
};

function Publication(vhost, borrowChannelFn, returnChannelFn, destroyChannelFn, publishFn, config) {
  const self = this;

  this.name = config.name;

  this.init = function (next) {
    debug('Initialising publication: %s', config.name);
    next(null, self);
  };

  this.publish = function (payload, overrides, next) {
    const publishConfig = _.defaultsDeep({}, overrides, config);
    const content = getContent(payload);
    publishConfig.options.contentType = publishConfig.options.contentType || content.type;
    publishConfig.options.messageId = publishConfig.options.messageId || uuid();

    publishConfig.encryption ? _publishEncrypted(content.buffer, publishConfig, next) : _publish(content.buffer, publishConfig, next);
  };

  this.forward = function (message, overrides, next) {
    const originalQueue = message.properties.headers.rascal.originalQueue;
    const publishConfig = _.defaultsDeep({}, overrides, config, {
      routingKey: message.fields.routingKey,
    });

    publishConfig.options = _.defaultsDeep(publishConfig.options, message.properties);

    _.set(publishConfig, 'options.headers.rascal.restoreRoutingHeaders', !!publishConfig.restoreRoutingHeaders);
    _.set(publishConfig, 'options.headers.rascal.originalExchange', message.fields.exchange);
    _.set(publishConfig, 'options.headers.rascal.originalRoutingKey', message.fields.routingKey);
    _.set(publishConfig, 'options.CC', _.chain([]).concat(publishConfig.options.CC, format('%s.%s', originalQueue, publishConfig.routingKey)).uniq().compact().value());

    _publish(message.content, publishConfig, next);
  };

  function _publishEncrypted(buffer, publishConfig, next) {
    const encryptionConfig = publishConfig.encryption;
    encrypt(encryptionConfig.algorithm, encryptionConfig.key, encryptionConfig.ivLength, buffer, (err, iv, encrypted) => {
      if (err) return next(err);
      debug('Message was encrypted using encryption profile: %s', encryptionConfig.name);
      _.set(publishConfig, 'options.headers.rascal.encryption.name', encryptionConfig.name);
      _.set(publishConfig, 'options.headers.rascal.encryption.iv', iv);
      _.set(publishConfig, 'options.headers.rascal.encryption.originalContentType', publishConfig.options.contentType);
      _.set(publishConfig, 'options.contentType', 'application/octet-stream');

      _publish(encrypted, publishConfig, next);
    });
  }

  function encrypt(algorithm, keyHex, ivLength, unencrypted, next) {
    crypto.randomBytes(ivLength, (err, iv) => {
      if (err) return next(err);
      let encrypted;
      try {
        const key = Buffer.from(keyHex, 'hex');
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        encrypted = Buffer.concat([cipher.update(unencrypted), cipher.final()]);
      } catch (err) {
        return next(err);
      }
      next(null, iv.toString('hex'), encrypted);
    });
  }

  function _publish(buffer, publishConfig, next) {
    const messageId = publishConfig.options.messageId;
    const session = new PublicationSession(vhost, messageId);
    borrowChannelFn((err, channel) => {
      session._removePausedListener();
      if (err) return session.emit('error', err, messageId);
      if (session.isAborted()) return abortPublish(channel, messageId);
      const errorHandler = _.once(handleChannelError.bind(null, channel, messageId, session, config));
      const returnHandler = session.emit.bind(session, 'return');
      addListeners(channel, errorHandler, returnHandler);
      try {
        session._startPublish();
        publishFn(channel, buffer, publishConfig, (err, ok) => {
          session._endPublish();
          if (err) {
            destroyChannel(channel, errorHandler, returnHandler);
            return session.emit('error', err, messageId);
          }

          ok ? returnChannel(channel, errorHandler, returnHandler) : deferReturnChannel(channel, errorHandler, returnHandler);

          session.emit('success', messageId);
        });
      } catch (err) {
        returnChannel(channel, errorHandler, returnHandler);
        return session.emit('error', err, messageId);
      }
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
    channel.once('drain', () => {
      returnChannel(channel, errorHandler, returnHandler);
    });
  }

  function destroyChannel(channel, errorHandler, returnHandler) {
    removeListeners(channel, errorHandler, returnHandler);
    destroyChannelFn(channel);
  }

  function getContent(payload) {
    if (Buffer.isBuffer(payload)) return bufferMessage(payload);
    if (_.isString(payload)) return textMessage(payload);
    return jsonMessage(payload);
  }

  function bufferMessage(payload) {
    return { buffer: payload, type: undefined };
  }

  function textMessage(payload) {
    return { buffer: Buffer.from(payload), type: 'text/plain' };
  }

  function jsonMessage(payload) {
    return {
      buffer: Buffer.from(JSON.stringify(payload)),
      type: 'application/json',
    };
  }
}

function addListeners(channel, errorHandler, returnHandler) {
  channel.on('error', errorHandler);
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
  const ok = channel.publish(config.destination, config.routingKey, content, config.options);
  next(null, ok);
}

function publishToConfirmExchange(channel, content, config, next) {
  debug('Publishing %d bytes to confirm exchange: %s with routingKeys: %s', content.length, config.exchange, _.compact([].concat(config.routingKey, config.options.CC, config.options.BCC)).join(', '));

  const once = _.once(next);
  const timeout = config.timeout ? setConfirmationTimeout(config.timeout, config.destination, once) : null;

  const ok = channel.publish(config.destination, config.routingKey, content, config.options, (err) => {
    clearTimeout(timeout);
    once(err, ok);
  });
}

function sendToQueue(channel, content, config, next) {
  debug('Publishing %d bytes to queue: %s', content.length, config.queue);
  const ok = channel.sendToQueue(config.destination, content, config.options);
  next(null, ok);
}

function sendToConfirmQueue(channel, content, config, next) {
  debug('Publishing %d bytes to queue: %s', content.length, config.queue);

  const once = _.once(next);
  const timeout = config.timeout ? setConfirmationTimeout(config.timeout, config.destination, once) : null;

  const ok = channel.sendToQueue(config.destination, content, config.options, (err) => {
    clearTimeout(timeout);
    next(err, ok);
  });
}

function setConfirmationTimeout(timeout, destination, next) {
  return setTimeoutUnref(() => {
    next(new Error(format('Timedout after %dms waiting for broker to confirm publication to: %s', timeout, destination)));
  }, timeout);
}

function handleChannelError(borked, messageId, emitter, config, err) {
  debug('Channel error: %s during publication of message: %s to %s using channel: %s', err.message, messageId, config.name, borked._rascal_id);
  emitter.emit('error', err, messageId);
}
