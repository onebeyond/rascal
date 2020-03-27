var debug = require('debug')('rascal:Subscription');
var _ = require('lodash');
var safeParse = require('safe-json-parse/callback');
var SubscriberSession = require('./SubscriberSession');
var SubscriberError = require('./SubscriberError');
var format = require('util').format;
var backoff = require('../backoff');
var crypto = require('crypto');
var async = require('async');

module.exports = {
  create: function(broker, vhost, counter, config, next) {
    return new Subscription(broker, vhost, config, counter).init(next);
  },
};

function Subscription(broker, vhost, config, counter) {
  var timer = backoff(config.retry);
  var subscriberError = new SubscriberError(broker, vhost);
  var sequentialChannelOperations = async.queue(function(task, next) {
    task(next);
  }, 1);
  var self = this;

  this.name = config.name;

  this.init = function(next) {
    debug('Initialising subscription: %s', config.name);
    return next(null, self);
  };

  this.subscribe = function(overrides, next) {
    var session = new SubscriberSession(sequentialChannelOperations, config);
    subscribeLater(session, _.defaultsDeep(overrides, config));
    return next(null, session);
  };

  function subscribeLater(session, config) {
    session.on('newListener', function(event) {
      if (event !== 'message') return;
      subscribeNow(session, config, function(err) {
        if (err) return session.emit('error', err);
        session.emit('subscribed');
      });
    });
  }

  function subscribeNow(session, config, next) {
    sequentialChannelOperations.push(function(done) {
      if (session.isCancelled()) {
        debug('Subscription to queue: %s has been cancelled', config.queue);
        return done();
      }
      debug('Subscribing to queue: %s', config.queue);
      vhost.getChannel(function(err, channel) {
        if (err) return done(err);
        if (config.prefetch) channel.prefetch(config.prefetch);

        var removeErrorHandlers = attachErrorHandlers(channel, session, config);
        var onMessage = _onMessage.bind(null, session, config, removeErrorHandlers);

        channel.consume(config.source, onMessage, config.options, function(err, response) {
          if (err) {
            debug('Error subscribing to %s using channel: %s. %s', config.source, channel._rascal_id, err.message);
            removeErrorHandlers();
            return done(err);
          }
          session._open(channel, response.consumerTag, function(err) {
            if (err) return done(err);
            timer.reset();
            done();
          });
        });
      });
    }, next);
  }

  function _onMessage(session, config, removeErrorHandlers, message) {
    if (!message) return handleConsumerCancel(session, config, removeErrorHandlers);

    debug('Received message: %s from queue: %s', message.properties.messageId, config.queue);

    decorateWithRoutingHeaders(message);
    if (immediateNack(message)) return ackOrNack(session, message, true);

    decorateWithRedeliveries(message, function(err) {
      if (err) return handleRedeliveriesError(err, session, message);
      if (redeliveriesExceeded(message)) return handleRedeliveriesExceeded(session, message);

      getContent(message, config, function(err, content) {
        err ? handleContentError(session, message, err)
            : session.emit('message', message, content, ackOrNack.bind(null, session, message));
      });
    });
  }

  function getContent(message, config, next) {
    if (message.properties.headers.rascal.encryption) {
      var encryptionConfig = config.encryption[message.properties.headers.rascal.encryption.name];
      if (!encryptionConfig) return next(new Error(format('Unknown encryption profile: %s', message.properties.headers.rascal.encryption.name)));
      decrypt(encryptionConfig.algorithm, encryptionConfig.key, message.properties.headers.rascal.encryption.iv, message.content, function(err, unencrypted) {
        if (err) return next(err);
        debug('Message was decrypted using encryption profile: %s', message.properties.headers.rascal.encryption.name);
        var contentType = config.contentType || message.properties.headers.rascal.encryption.originalContentType;
        negotiateContent(contentType, unencrypted, next);
      });
    } else {
      var contentType = config.contentType || message.properties.contentType;
      negotiateContent(contentType, message.content, next);
    }
  }

  function negotiateContent(contentType, content, next) {
    if (contentType === 'text/plain') return next(null, content.toString());
    if (contentType === 'application/json') return safeParse(content.toString(), next);
    return next(null, content);
  }

  function decrypt(algorithm, keyHex, ivHex, encrypted, next) {
    var unencrypted;
    try {
      var key = Buffer.from(keyHex, 'hex');
      var iv = Buffer.from(ivHex, 'hex');
      var cipher = crypto.createDecipheriv(algorithm, key, iv);
      unencrypted = Buffer.concat([cipher.update(encrypted), cipher.final()]);
    } catch (err) {
      return next(err);
    }
    next(null, unencrypted);
  }

  function handleContentError(session, message, err) {
    debug('Error getting content for message %s: %s', message.properties.messageId, err.message);
    // Documentation wrongly specified 'invalid_content' instead of 'invalid_message' emitting both
    if (session.emit('invalid_content', err, message, ackOrNack.bind(null, session, message))) return;
    if (session.emit('invalid_message', err, message, ackOrNack.bind(null, session, message))) return;
    nackAndError(session, message, err);
  }

  function redeliveriesExceeded(message) {
    return message.properties.headers.rascal.redeliveries > config.redeliveries.limit;
  }

  function handleRedeliveriesError(err, session, message) {
    debug('Error handling redeliveries of message %s: %s',  message.properties.messageId, err.message);
    if (session.emit('redeliveries_error', err, message, ackOrNack.bind(null, session, message))) return;
    if (session.emit('redeliveries_exceeded', err, message, ackOrNack.bind(null, session, message))) return;
    nackAndError(session, message, err);
  }

  function handleRedeliveriesExceeded(session, message) {
    var err = new Error(format('Message %s has exceeded %d redeliveries', message.properties.messageId, config.redeliveries.limit));
    debug(err.message);
    if (session.emit('redeliveries_exceeded', err, message, ackOrNack.bind(null, session, message))) return;
    if (session.emit('redeliveries_error', err, message, ackOrNack.bind(null, session, message))) return;
    nackAndError(session, message, err);
  }

  function nackAndError(session, message, err) {
    ackOrNack(session, message, err, function() {
      // Using setTimeout rather than process.nextTick as the latter fires before any IO.
      // If the app shuts down before the IO has completed, the message will be rolled back
      setTimeout(session.emit.bind(session, 'error', err)).unref();
    });
  }

  function decorateWithRoutingHeaders(message) {
    message.properties.headers = message.properties.headers || {};
    message.properties.headers.rascal = message.properties.headers.rascal || {};
    message.properties.headers.rascal.originalQueue = config.source;
    message.properties.headers.rascal.originalVhost = vhost.name;
    if (message.properties.headers.rascal.originalRoutingKey) message.fields.routingKey = message.properties.headers.rascal.originalRoutingKey;
    if (message.properties.headers.rascal.originalExchange) message.fields.exchange = message.properties.headers.rascal.originalExchange;
  }

  function decorateWithRedeliveries(message, next) {
    var once = _.once(next);
    var timeout = setTimeout(function() {
      once(new Error(format('Redeliveries timed out after %dms', config.redeliveries.timeout)));
    }, config.redeliveries.timeout);
    countRedeliveries(message, function(err, redeliveries) {
      clearTimeout(timeout);
      if (err) return once(err);
      message.properties.headers.rascal.redeliveries = redeliveries;
      once();
    });
  }

  function countRedeliveries(message, next) {
    if (!message.fields.redelivered) return next(null, 0);
    if (!message.properties.messageId) return next(null, 0);
    counter.incrementAndGet(config.name + '/' + message.properties.messageId, next);
  }

  function immediateNack(message) {
    if (_.get(message, format('properties.headers.rascal.recovery.%s.immediateNack', message.properties.headers.rascal.originalQueue))) return true;
    if (_.get(message, format('properties.headers.rascal.recovery.%s.immediateNack', message.properties.headers.rascal.originalQueue))) return true;
    return false;
  }

  function ackOrNack(session, message, err, recovery, next) {
    if (arguments.length === 2) return ackOrNack(session, message, undefined, undefined, emitOnError.bind(null, session));
    if (arguments.length === 3 && _.isFunction(arguments[2])) return ackOrNack(session, message, undefined, undefined, arguments[2]);
    if (arguments.length === 3) return ackOrNack(session, message, err, undefined, emitOnError.bind(null, session));
    if (arguments.length === 4 && _.isFunction(arguments[3])) return ackOrNack(session, message, err, undefined, arguments[3]);
    if (arguments.length === 4) return ackOrNack(session, message, err, recovery, emitOnError.bind(null, session));
    if (err) return subscriberError.handle(session, message, err, recovery, next);
    session._ack(message, next);
  }

  function emitOnError(session, err) {
    if (err) session.emit('error', err);
  }

  function attachErrorHandlers(channel, session, config) {
    var connection = channel.connection;
    var removeErrorHandlers = _.once(function() {
      channel.removeListener('error', errorHandler);
      channel.on('error', function(err) {
        debug('Suppressing error on cancelled session: %s to prevent connection errors. %s', channel._rascal_id, err.message);
      });
      connection.removeListener('error', errorHandler);
      connection.removeListener('close', errorHandler);
    });
    var errorHandler = _.once(handleChannelError.bind(null, session, config, removeErrorHandlers, 0));
    channel.once('error', errorHandler);
    connection.once('error', errorHandler);
    connection.once('close', errorHandler);
    return removeErrorHandlers;
  }

  function handleChannelError(session, config, removeErrorHandlers, attempts, err) {
    debug('Handling channel error: %s from %s using channel: %s', err.message, config.name, session._getRascalChannelId());
    if (removeErrorHandlers) removeErrorHandlers();
    session.emit('error', err);
    config.retry && subscribeNow(session, config, function(err) {
      if (!err) return;
      var delay = timer.next();
      debug('Will attempt resubscription(%d) to %s in %dms', attempts + 1, config.name, delay);
      session._schedule(handleChannelError.bind(null, session, config, null, attempts + 1, err), delay);
    });
  }

  function handleConsumerCancel(session, config, removeErrorHandlers) {
    debug('Received consumer cancel from %s using channel: %s', config.name, session._getRascalChannelId());
    removeErrorHandlers();
    session._close(function(err) {
      if (err) debug('Error cancelling subscription: %s', err.message);
      var cancelErr = new Error(format('Subscription: %s was cancelled by the broker', config.name));
      session.emit('cancelled', cancelErr) || session.emit('error', cancelErr);
      config.retry && subscribeNow(session, config, function(err) {
        if (!err) return;
        var delay = timer.next();
        debug('Will attempt resubscription(%d) to %s in %dms', 1, config.name, delay);
        session._schedule(handleChannelError.bind(null, session, config, null, 1, err), delay);
      });
    });
  }
}
