const debug = require('debug')('rascal:SubscriberSession');
const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;
const _ = require('lodash');
const async = require('async');
const setTimeoutUnref = require('../utils/setTimeoutUnref');

module.exports = SubscriberSession;

inherits(SubscriberSession, EventEmitter);

function SubscriberSession(sequentialChannelOperations, config) {
  let index = 0;
  const channels = {};
  let cancelled = false;
  let timeout;
  const self = this;

  this.name = config.name;
  this.config = _.cloneDeep(config);

  this.isCancelled = function () {
    return cancelled;
  };

  this._open = function (channel, consumerTag, next) {
    if (cancelled) return next(new Error('Subscriber has been cancelled'));
    debug('Opening subscriber session: %s on channel: %s', consumerTag, channel._rascal_id);
    channels[consumerTag] = { index: index++, channel, consumerTag, unacknowledgedMessages: 0 };
    channel.once('close', unref.bind(null, consumerTag));
    channel.once('error', unref.bind(null, consumerTag));
    next();
  };

  this.cancel = function (next) {
    clearTimeout(timeout);
    sequentialChannelOperations.push((done) => {
      cancelled = true;
      self._unsafeClose(done);
    }, next);
  };

  this._close = function (next) {
    sequentialChannelOperations.push((done) => {
      self._unsafeClose(done);
    }, next);
  };

  this._unsafeClose = function (next) {
    withCurrentChannel(
      (channel, consumerTag, entry) => {
        entry.doomed = true;
        debug('Cancelling subscriber session: %s on channel: %s', consumerTag, channel._rascal_id);
        channel.cancel(consumerTag, (err) => {
          if (err) return next(err);
          const waitOrTimeout = config.closeTimeout ? async.timeout(waitForUnacknowledgedMessages, config.closeTimeout) : waitForUnacknowledgedMessages;
          waitOrTimeout(entry, null, (err) => {
            channel.close(() => {
              debug('Channel: %s was closed', entry.channel._rascal_id);
              next(err);
            });
          });
        });
      },
      () => {
        debug('No current subscriber session');
        next();
      }
    );
  };

  this._schedule = function (fn, delay) {
    timeout = setTimeoutUnref(fn, delay);
  };

  this._getRascalChannelId = function () {
    let rascalChannelId = null;
    withCurrentChannel((channel) => {
      rascalChannelId = channel._rascal_id;
    });
    return rascalChannelId;
  };

  this._incrementUnacknowledgeMessageCount = function (consumerTag) {
    if (config.options.noAck) return;
    withConsumerChannel(consumerTag, (channel, __, entry) => {
      debug('Channel: %s has %s unacknowledged messages', channel._rascal_id, ++entry.unacknowledgedMessages);
    });
  };

  this._decrementUnacknowledgeMessageCount = function (consumerTag) {
    if (config.options.noAck) return;
    withConsumerChannel(consumerTag, (channel, __, entry) => {
      debug('Channel: %s has %s unacknowledged messages', channel._rascal_id, --entry.unacknowledgedMessages);
    });
  };

  this._ack = function (message, next) {
    withConsumerChannel(
      message.fields.consumerTag,
      (channel) => {
        debug('Acknowledging message: %s on channel: %s', message.properties.messageId, channel._rascal_id);
        channel.ack(message);
        self._decrementUnacknowledgeMessageCount(message.fields.consumerTag);
        setImmediate(next);
      },
      () => {
        setImmediate(() => {
          next(new Error('The channel has been closed. Unable to ack message'));
        });
      }
    );
  };

  this._nack = function (message, options, next) {
    if (arguments.length === 2) return self._nack(arguments[0], {}, arguments[1]);
    withConsumerChannel(
      message.fields.consumerTag,
      (channel) => {
        debug('Not acknowledging message: %s with requeue: %s on channel: %s', message.properties.messageId, !!options.requeue, channel._rascal_id);
        channel.nack(message, false, !!options.requeue);
        self._decrementUnacknowledgeMessageCount(message.fields.consumerTag);
        setImmediate(next);
      },
      () => {
        setImmediate(() => {
          next(new Error('The channel has been closed. Unable to nack message'));
        });
      }
    );
  };

  function withCurrentChannel(fn, altFn) {
    const entry = _.chain(channels)
      .values()
      .filter((entry) => !entry.doomed)
      .sortBy('index')
      .last()
      .value();
    if (entry) return fn(entry.channel, entry.consumerTag, entry);
    return altFn && altFn();
  }

  function withConsumerChannel(consumerTag, fn, altFn) {
    const entry = channels[consumerTag];
    if (entry) return fn(entry.channel, entry.consumerTag, entry);
    return altFn && altFn();
  }

  function unref(consumerTag) {
    withConsumerChannel(consumerTag, (channel) => {
      debug('Removing channel: %s from session', channel._rascal_id);
      delete channels[consumerTag];
    });
  }

  function waitForUnacknowledgedMessages(entry, previousCount, next) {
    const currentCount = entry.unacknowledgedMessages;
    if (currentCount > 0) {
      if (currentCount !== previousCount) {
        debug('Waiting for %d unacknowledged messages from channel: %s', currentCount, entry.channel._rascal_id);
      }
      setTimeoutUnref(() => waitForUnacknowledgedMessages(entry, currentCount, next), 100);
      return;
    }
    next();
  }
}
