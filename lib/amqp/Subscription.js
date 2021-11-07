const debug = require('debug')('rascal:Subscription');
const _ = require('lodash');
const safeParse = require('safe-json-parse/callback');
const SubscriberSession = require('./SubscriberSession');
const SubscriberError = require('./SubscriberError');
const format = require('util').format;
const backoff = require('../backoff');
const crypto = require('crypto');
const async = require('async');
const setTimeoutUnref = require('../utils/setTimeoutUnref');

module.exports = {
  create(broker, vhost, counter, config, next) {
    return new Subscription(broker, vhost, config, counter).init(next);
  },
};

function Subscription(broker, vhost, config, counter) {
  const timer = backoff(config.retry);
  const subscriberError = new SubscriberError(broker, vhost);
  const sequentialChannelOperations = async.queue((task, next) => {
    task(next);
  }, 1);
  const self = this;

  this.name = config.name;

  this.init = function (next) {
    debug('Initialising subscription: %s', config.name);
    return next(null, self);
  };

  this.subscribe = function (overrides, next) {
    const session = new SubscriberSession(sequentialChannelOperations, config);
    subscribeLater(session, _.defaultsDeep(overrides, config));
    return next(null, session);
  };

  function subscribeLater(session, config) {
    session.on('newListener', (event) => {
      if (event !== 'message') return;
      subscribeNow(session, config, (err) => {
        if (err) return session.emit('error', err);
        session.emit('subscribed');
      });
    });
  }

  function subscribeNow(session, config, next) {
    sequentialChannelOperations.push((done) => {
      if (session.isCancelled()) {
        debug('Subscription to queue: %s has been cancelled', config.queue);
        return done();
      }
      debug('Subscribing to queue: %s', config.queue);
      vhost.getChannel((err, channel) => {
        if (err) return done(err);
        if (!channel) return done();

        if (config.prefetch) channel.prefetch(config.prefetch);

        const removeErrorHandlers = attachErrorHandlers(channel, session, config);
        const onMessage = _onMessage.bind(null, session, config, removeErrorHandlers);

        channel.consume(config.source, onMessage, config.options, (err, response) => {
          if (err) {
            debug('Error subscribing to %s using channel: %s. %s', config.source, channel._rascal_id, err.message);
            removeErrorHandlers();
            return done(err);
          }
          session._open(channel, response.consumerTag, (err) => {
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
    session._incrementUnacknowledgeMessageCount(message.fields.consumerTag);

    decorateWithRoutingHeaders(message);
    if (immediateNack(message)) return ackOrNack(session, message, true);

    decorateWithRedeliveries(message, (err) => {
      if (err) return handleRedeliveriesError(err, session, message);
      if (redeliveriesExceeded(message)) return handleRedeliveriesExceeded(session, message);

      getContent(message, config, (err, content) => {
        err ? handleContentError(session, message, err) : session.emit('message', message, content, getAckOrNack(session, message));
      });
    });
  }

  function getContent(message, config, next) {
    if (message.properties.headers.rascal.encryption) {
      const encryptionConfig = config.encryption[message.properties.headers.rascal.encryption.name];
      if (!encryptionConfig) return next(new Error(format('Unknown encryption profile: %s', message.properties.headers.rascal.encryption.name)));
      decrypt(encryptionConfig.algorithm, encryptionConfig.key, message.properties.headers.rascal.encryption.iv, message.content, (err, unencrypted) => {
        if (err) return next(err);
        debug('Message was decrypted using encryption profile: %s', message.properties.headers.rascal.encryption.name);
        const contentType = config.contentType || message.properties.headers.rascal.encryption.originalContentType;
        negotiateContent(contentType, unencrypted, next);
      });
    } else {
      const contentType = config.contentType || message.properties.contentType;
      negotiateContent(contentType, message.content, next);
    }
  }

  function negotiateContent(contentType, content, next) {
    if (contentType === 'text/plain') return next(null, content.toString());
    if (contentType === 'application/json') return safeParse(content.toString(), next);
    return next(null, content);
  }

  function decrypt(algorithm, keyHex, ivHex, encrypted, next) {
    let unencrypted;
    try {
      const key = Buffer.from(keyHex, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const cipher = crypto.createDecipheriv(algorithm, key, iv);
      unencrypted = Buffer.concat([cipher.update(encrypted), cipher.final()]);
    } catch (err) {
      return next(err);
    }
    next(null, unencrypted);
  }

  function handleContentError(session, message, err) {
    debug('Error getting content for message %s: %s', message.properties.messageId, err.message);
    // Documentation wrongly specified 'invalid_content' instead of 'invalid_message' emitting both
    if (session.emit('invalid_content', err, message, getAckOrNack(session, message))) return;
    if (session.emit('invalid_message', err, message, getAckOrNack(session, message))) return;
    nackAndError(session, message, err);
  }

  function redeliveriesExceeded(message) {
    return message.properties.headers.rascal.redeliveries > config.redeliveries.limit;
  }

  function handleRedeliveriesError(err, session, message) {
    debug('Error handling redeliveries of message %s: %s', message.properties.messageId, err.message);
    if (session.emit('redeliveries_error', err, message, getAckOrNack(session, message))) return;
    if (session.emit('redeliveries_exceeded', err, message, getAckOrNack(session, message))) return;
    nackAndError(session, message, err);
  }

  function handleRedeliveriesExceeded(session, message) {
    const err = new Error(format('Message %s has exceeded %d redeliveries', message.properties.messageId, config.redeliveries.limit));
    debug(err.message);
    if (session.emit('redeliveries_exceeded', err, message, getAckOrNack(session, message))) return;
    if (session.emit('redeliveries_error', err, message, getAckOrNack(session, message))) return;
    nackAndError(session, message, err);
  }

  function nackAndError(session, message, err) {
    ackOrNack(session, message, err, () => {
      // Using setTimeout rather than process.nextTick as the latter fires before any IO.
      // If the app shuts down before the IO has completed, the message will be rolled back
      setTimeoutUnref(session.emit.bind(session, 'error', err));
    });
  }

  function decorateWithRoutingHeaders(message) {
    message.properties.headers = message.properties.headers || {};
    message.properties.headers.rascal = message.properties.headers.rascal || {};
    message.properties.headers.rascal.originalQueue = config.source;
    message.properties.headers.rascal.originalVhost = vhost.name;

    if (!message.properties.headers.rascal.restoreRoutingHeaders) return;
    if (message.properties.headers.rascal.originalRoutingKey) message.fields.routingKey = message.properties.headers.rascal.originalRoutingKey;
    if (message.properties.headers.rascal.originalExchange) message.fields.exchange = message.properties.headers.rascal.originalExchange;
  }

  function decorateWithRedeliveries(message, next) {
    const once = _.once(next);
    const timeout = setTimeoutUnref(() => {
      once(new Error(format('Redeliveries timed out after %dms', config.redeliveries.timeout)));
    }, config.redeliveries.timeout);
    countRedeliveries(message, (err, redeliveries) => {
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
    if (_.get(message, ['properties', 'headers', 'rascal', 'recovery', message.properties.headers.rascal.originalQueue, 'immediateNack'])) return true;
    return false;
  }

  function getAckOrNack(session, message) {
    if (!broker.promises || config.promisifyAckOrNack === false) return ackOrNack.bind(null, session, message);
    if (config.promisifyAckOrNack) return ackOrNackP.bind(null, session, message);
    return ackOrNack.bind(null, session, message);
  }

  function ackOrNack(session, message, err, recovery, next) {
    if (arguments.length === 2) return ackOrNack(session, message, undefined, undefined, emitOnError.bind(null, session));
    if (arguments.length === 3 && _.isFunction(arguments[2])) return ackOrNack(session, message, undefined, undefined, arguments[2]);
    if (arguments.length === 3) return ackOrNack(session, message, err, undefined, emitOnError.bind(null, session));
    if (arguments.length === 4 && _.isFunction(arguments[3])) return ackOrNack(session, message, err, undefined, arguments[3]);
    if (arguments.length === 4) return ackOrNack(session, message, err, recovery, emitOnError.bind(null, session));
    err ? subscriberError.handle(session, message, err, recovery, next) : session._ack(message, next);
  }

  function ackOrNackP(session, message, err, recovery) {
    if (arguments.length === 2) return ackOrNackP(session, message, undefined, undefined);
    if (arguments.length === 3) return ackOrNackP(session, message, err, undefined);

    return new Promise((resolve, reject) => {
      const cb = function (err) {
        err ? reject(err) : resolve();
      };
      err ? subscriberError.handle(session, message, err, recovery, cb) : session._ack(message, cb);
    });
  }

  function emitOnError(session, err) {
    if (err) session.emit('error', err);
  }

  function attachErrorHandlers(channel, session, config) {
    /* eslint-disable no-use-before-define */
    const connection = channel.connection;
    const removeErrorHandlers = _.once(() => {
      channel.removeListener('error', errorHandler);
      channel.on('error', (err) => {
        debug('Suppressing error on cancelled session: %s to prevent connection errors. %s', channel._rascal_id, err.message);
      });
      connection.removeListener('error', errorHandler);
      connection.removeListener('close', errorHandler);
    });
    const errorHandler = _.once(handleChannelError.bind(null, session, config, removeErrorHandlers, 0));
    channel.on('error', errorHandler);
    connection.once('error', errorHandler);
    connection.once('close', errorHandler);
    return removeErrorHandlers;
  }

  function handleChannelError(session, config, removeErrorHandlers, attempts, err) {
    debug('Handling channel error: %s from %s using channel: %s', err.message, config.name, session._getRascalChannelId());
    if (removeErrorHandlers) removeErrorHandlers();
    session.emit('error', err);
    config.retry &&
      subscribeNow(session, config, (err) => {
        if (!err) return;
        const delay = timer.next();
        debug('Will attempt resubscription(%d) to %s in %dms', attempts + 1, config.name, delay);
        session._schedule(handleChannelError.bind(null, session, config, null, attempts + 1, err), delay);
      });
  }

  function handleConsumerCancel(session, config, removeErrorHandlers) {
    debug('Received consumer cancel from %s using channel: %s', config.name, session._getRascalChannelId());
    removeErrorHandlers();
    session._close((err) => {
      if (err) debug('Error cancelling subscription: %s', err.message);
      const cancelErr = new Error(format('Subscription: %s was cancelled by the broker', config.name));
      session.emit('cancelled', cancelErr) || session.emit('error', cancelErr);
      config.retry &&
        subscribeNow(session, config, (err) => {
          if (!err) return;
          const delay = timer.next();
          debug('Will attempt resubscription(%d) to %s in %dms', 1, config.name, delay);
          session._schedule(handleChannelError.bind(null, session, config, null, 1, err), delay);
        });
    });
  }
}
