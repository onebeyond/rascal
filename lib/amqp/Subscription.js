const debug = require('debug')('rascal:Subscription');
const _ = require('lodash');
const format = require('util').format;
const crypto = require('crypto');
const async = require('async');
const safeParse = require('safe-json-parse/callback');
const SubscriberSession = require('./SubscriberSession');
const SubscriberError = require('./SubscriberError');
const backoff = require('../backoff');
const setTimeoutUnref = require('../utils/setTimeoutUnref');
const { EMPTY_X_DEATH } = require('./XDeath');

module.exports = {
  create(broker, vhost, counter, config, next) {
    return new Subscription(broker, vhost, config, counter).init(next);
  },
};

function Subscription(broker, vhost, subscriptionConfig, counter) {
  const timer = backoff(subscriptionConfig.retry);
  const subscriberError = new SubscriberError(broker, vhost);
  const sequentialChannelOperations = async.queue((task, next) => {
    task(next);
  }, 1);
  const self = this;

  this.name = subscriptionConfig.name;

  this.init = function (next) {
    debug('Initialising subscription: %s', subscriptionConfig.name);
    return next(null, self);
  };

  this.subscribe = function (overrides, next) {
    const config = _.defaultsDeep(overrides, subscriptionConfig);
    const session = new SubscriberSession(sequentialChannelOperations, config);
    subscribeLater(session, config);
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

        _configureQos(config, channel, (err) => {
          if (err) return done(err);

          const removeDisconnectionHandlers = attachDisconnectionHandlers(channel, session, config);
          const onMessage = _onMessage.bind(null, session, config, removeDisconnectionHandlers);

          channel.consume(config.source, onMessage, config.options, (err, response) => {
            if (err) {
              debug('Error subscribing to %s using channel: %s. %s', config.source, channel._rascal_id, err.message);
              removeDisconnectionHandlers();
              return done(err);
            }
            session._open(channel, response.consumerTag, (err) => {
              if (err) return done(err);
              timer.reset();
              done();
            });
          });
        });
      });
    }, next);
  }

  function _configureQos(config, channel, next) {
    const qos = [];
    if (config.prefetch) qos.push((cb) => channel.prefetch(config.prefetch, false, cb));
    if (config.channelPrefetch) qos.push((cb) => channel.prefetch(config.channelPrefetch, true, cb));
    async.series(qos, next);
  }

  function _onMessage(session, config, removeDisconnectionHandlers, message) {
    if (!message) return handleConsumerCancel(session, config, removeDisconnectionHandlers);

    debug('Received message: %s from queue: %s', message.properties.messageId, config.queue);
    session._incrementUnacknowledgeMessageCount(message.fields.consumerTag);

    decorateWithRoutingHeaders(message);
    if (immediateNack(message)) {
      debug('Immediately nacking message: %s from queue: %s', message.properties.messageId, config.queue);
      ackOrNack(session, message, new Error('Immediate nack'));
      return;
    }

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
    return message.properties.headers.rascal.redeliveries > subscriptionConfig.redeliveries.limit;
  }

  function handleRedeliveriesError(err, session, message) {
    debug('Error handling redeliveries of message %s: %s', message.properties.messageId, err.message);
    if (session.emit('redeliveries_error', err, message, getAckOrNack(session, message))) return;
    if (session.emit('redeliveries_exceeded', err, message, getAckOrNack(session, message))) return;
    nackAndError(session, message, err);
  }

  function handleRedeliveriesExceeded(session, message) {
    const err = new Error(format('Message %s has exceeded %d redeliveries', message.properties.messageId, subscriptionConfig.redeliveries.limit));
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
    message.properties.headers.rascal.originalQueue = subscriptionConfig.source;
    message.properties.headers.rascal.originalVhost = vhost.name;

    if (!message.properties.headers.rascal.restoreRoutingHeaders) return;
    if (message.properties.headers.rascal.originalRoutingKey) message.fields.routingKey = message.properties.headers.rascal.originalRoutingKey;
    if (message.properties.headers.rascal.originalExchange) message.fields.exchange = message.properties.headers.rascal.originalExchange;
  }

  function decorateWithRedeliveries(message, next) {
    const once = _.once(next);
    const timeout = setTimeoutUnref(() => {
      once(new Error(format('Redeliveries timed out after %dms', subscriptionConfig.redeliveries.timeout)));
    }, subscriptionConfig.redeliveries.timeout);
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
    counter.incrementAndGet(`${subscriptionConfig.name}/${message.properties.messageId}`, next);
  }

  function immediateNack(message) {
    const originalQueue = message.properties.headers.rascal.originalQueue;
    const xDeathRecords = message.properties.headers['x-death'] || [];
    const currentXDeath = xDeathRecords.find(({ queue, reason }) => queue === originalQueue && reason === 'rejected') || EMPTY_X_DEATH;
    const previousXDeath = _.get(message, ['properties', 'headers', 'rascal', 'recovery', originalQueue, 'xDeath'], EMPTY_X_DEATH);
    const hasImmediateNackHeader = _.has(message, ['properties', 'headers', 'rascal', 'recovery', originalQueue, 'immediateNack']);
    if (!hasImmediateNackHeader) return false;
    debug('Message %s has been marked for immediate nack. Previous xDeath is %o. Current xDeath is %o.', message.properties.messageId, previousXDeath, currentXDeath);
    // See https://github.com/rabbitmq/rabbitmq-server/issues/11331
    // RabbitMQ v3.13 stopped updating the xDeath record's count property.
    // RabbitMQ v3.12 does not update the xDeath record's time property.
    // Therefore having test them both
    if (currentXDeath.count > previousXDeath.count || currentXDeath.time.value > previousXDeath.time.value) {
      debug('Message %s has been replayed after being dead lettered. Removing immediate nack.', message.properties.messageId);
      _.unset(message, ['properties', 'headers', 'rascal', 'recovery', originalQueue, 'immediateNack']);
      _.unset(message, ['properties', 'headers', 'rascal', 'recovery', originalQueue, 'xDeath']);
      return false;
    }
    return true;
  }

  function getAckOrNack(session, message) {
    return broker.promises && subscriptionConfig.promisifyAckOrNack ? ackOrNackP.bind(null, session, message) : ackOrNack.bind(null, session, message);
  }

  function ackOrNack(session, message, err, options, next) {
    if (arguments.length === 2) return ackOrNack(session, message, undefined, undefined, emitOnError.bind(null, session));
    if (arguments.length === 3 && _.isFunction(arguments[2])) return ackOrNack(session, message, undefined, undefined, arguments[2]);
    if (arguments.length === 3) return ackOrNack(session, message, err, undefined, emitOnError.bind(null, session));
    if (arguments.length === 4 && _.isFunction(arguments[3])) return ackOrNack(session, message, err, undefined, arguments[3]);
    if (arguments.length === 4) return ackOrNack(session, message, err, options, emitOnError.bind(null, session));

    if (message.__rascal_acknowledged) return next(new Error('ackOrNack should only be called once per message'));
    message.__rascal_acknowledged = true;

    if (err) return subscriberError.handle(session, message, err, options, next);
    if (options && options.all) return session._ackAll(message, next);
    session._ack(message, next);
  }

  function ackOrNackP(session, message, err, options) {
    if (arguments.length === 2) return ackOrNackP(session, message, undefined, undefined);
    if (arguments.length === 3) return ackOrNackP(session, message, err, undefined);

    return new Promise((resolve, reject) => {
      const next = function (err) {
        err ? reject(err) : resolve();
      };
      if (err) subscriberError.handle(session, message, err, options, next);
      else if (options && options.all) session._ackAll(message, next);
      else session._ack(message, next);
    });
  }

  function emitOnError(session, err) {
    if (err) session.emit('error', err);
  }

  function attachDisconnectionHandlers(channel, session, config) {
    /* eslint-disable no-use-before-define */
    const connection = channel.connection;
    const removeDisconnectionHandlers = _.once(() => {
      channel.removeListener('error', disconnectionHandler);
      channel.on('error', (err) => {
        debug('Suppressing error on cancelled session: %s to prevent connection errors. %s', channel._rascal_id, err.message);
      });
      connection.removeListener('error', disconnectionHandler);
      connection.removeListener('close', disconnectionHandler);
    });

    const disconnectionHandler = makeDisconnectionHandler(session, config, removeDisconnectionHandlers);
    channel.on('error', disconnectionHandler);
    connection.once('error', disconnectionHandler);
    connection.once('close', disconnectionHandler);
    return removeDisconnectionHandlers;
  }

  function makeDisconnectionHandler(session, config, removeDisconnectionHandlers) {
    return _.once((err) => {
      // Use setImmediate to avoid amqplib accept loop swallowing errors
      setImmediate(() => (err
        // Treat close events with errors as error events
        ? handleChannelError(session, config, removeDisconnectionHandlers, 0, err)
        : handleChannelClose(session, config, removeDisconnectionHandlers, 0)));
    });
  }

  function handleChannelError(session, config, removeDisconnectionHandler, attempt, err) {
    debug('Handling channel error: %s from %s using channel: %s', err.message, config.name, session._getRascalChannelId());
    if (removeDisconnectionHandler) removeDisconnectionHandler();
    session.emit('error', err);
    retrySubscription(session, config, attempt + 1);
  }

  function handleChannelClose(session, config, removeDisconnectionHandler, attempt) {
    debug('Handling channel close from %s using channel: %s', config.name, session._getRascalChannelId());
    removeDisconnectionHandler();
    session.emit('close');
    retrySubscription(session, config, attempt + 1);
  }

  function handleConsumerCancel(session, config, removeDisconnectionHandler) {
    debug('Received consumer cancel from %s using channel: %s', config.name, session._getRascalChannelId());
    removeDisconnectionHandler();
    const cancelErr = new Error(format('Subscription: %s was cancelled by the broker', config.name));
    session.emit('cancelled', cancelErr) || session.emit('cancel', cancelErr) || session.emit('error', cancelErr);
    session._close((err) => {
      if (err) debug('Error cancelling subscription: %s', err.message);
      retrySubscription(session, config, 1);
    });
  }

  function retrySubscription(session, config, attempt) {
    config.retry && subscribeNow(session, config, (err) => {
      if (!err) return;
      const delay = timer.next();
      debug('Will attempt resubscription(%d) to %s in %dms', attempt, config.name, delay);
      session._schedule(handleChannelError.bind(null, session, config, null, attempt, err), delay);
    });
  }
}
