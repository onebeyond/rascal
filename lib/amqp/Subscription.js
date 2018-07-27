var debug = require('debug')('rascal:Subscription');
var _ = require('lodash');
var safeParse = require('safe-json-parse/callback');
var SubscriberSession = require('./SubscriberSession');
var SubscriberError = require('./SubscriberError');
var format = require('util').format;
var backoff = require('../backoff');

module.exports = {
  create: function(broker, vhost, counter, config, next) {
    return new Subscription(broker, vhost, config, counter).init(next);
  },
};

function Subscription(broker, vhost, config, counter) {
  var timer = backoff(config.retry);
  var subscriberError = new SubscriberError(broker, vhost);
  var self = this;

  this.init = function(next) {
    debug('Initialising subscription: %s', config.name);
    return next(null, self);
  };

  this.subscribe = function(overrides, next) {
    _subscribe(new SubscriberSession(config), _.defaultsDeep(overrides, config), next);
  };

  function _subscribe(session, config, next) {
    debug('Subscribing to queue: %s', config.queue);
    vhost.getChannel(function(err, channel) {
      if (err) return next(err);
      if (config.prefetch) channel.prefetch(config.prefetch);

      attachErrorHandlers(channel, session, config);

      channel.consume(config.source, function(message) {
        if (!message) return; // consume is called with a null message when the RabbitMQ cancels the subscription
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
      }, config.options, function(err, response) {
        if (err) return next(err);
        session.open(channel, response.consumerTag);
        timer.reset();
        next(null, session);
      });
    });
  }

  function getContent(message, config, next) {
    var contentType = config.contentType || message.properties.contentType;
    if (contentType === 'text/plain') return next(null, message.content.toString());
    if (contentType === 'application/json') return safeParse(message.content.toString(), next);
    return next(null, message.content);
  }

  function handleContentError(session, message, err) {
    // Documentation wrongly specified 'invalid_content' instead of 'invalid_message' emitting both
    if (session.emit('invalid_content', err, message, ackOrNack.bind(null, session, message))) return;
    else if (session.emit('invalid_message', err, message, ackOrNack.bind(null, session, message))) return;
    nackAndError(session, message, err);
  }

  function redeliveriesExceeded(message) {
    return message.properties.headers.rascal.redeliveries > config.redeliveries.limit;
  }

  function handleRedeliveriesError(err, session, message) {
    if (session.emit('redeliveries_error', err, message, ackOrNack.bind(null, session, message))) return;
    if (session.emit('redeliveries_exceeded', err, message, ackOrNack.bind(null, session, message))) return;
    nackAndError(session, message, err);
  }

  function handleRedeliveriesExceeded(session, message) {
    var err = new Error(format('Message %s has exceeded %d redeliveries', message.properties.messageId, config.redeliveries.limit));
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
    var errorHandler = _.once(handleChannelError.bind(null, channel, session, config));
    channel.once('error', errorHandler);
    channel.connection.once('error', errorHandler);
    channel.connection.once('close', errorHandler);
  }

  function handleChannelError(borked, session, config, err) {
    debug('Handling channel error: %s from %s using channel: %s', err.message, config.name, borked._rascal_id);
    session.emit('error', err);
    config.retry && _subscribe(session, config, function(err) {
      if (!err) return;
      var delay = timer.next();
      debug('Will attempt resubscription in in %dms', delay);
      return setTimeout(handleChannelError.bind(null, borked, session, config, err), delay).unref();
    });
  }
}
