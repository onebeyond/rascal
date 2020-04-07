var debug = require('debug')('rascal:SubscriberSession');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var _ = require('lodash');

module.exports = SubscriberSession;

inherits(SubscriberSession, EventEmitter);

function SubscriberSession(sequentialChannelOperations, config) {

  var index = 0;
  var channels = {};
  var cancelled = false;
  var timeout;
  var self = this;

  this.name = config.name;

  this.isCancelled = function() {
    return cancelled;
  };

  this._open = function(channel, consumerTag, next) {
    if (cancelled) return next(new Error('Subscriber has been cancelled'));
    debug('Opening subscriber session: %s on channel: %s', consumerTag, channel._rascal_id);
    channels[consumerTag] = { index: index++, channel: channel, consumerTag: consumerTag };
    channel.once('close', unref.bind(null, consumerTag));
    channel.once('error', unref.bind(null, consumerTag));
    next();
  };

  this.cancel = function(next) {
    clearTimeout(timeout);
    sequentialChannelOperations.push(function(done) {
      cancelled = true;
      self._unsafeClose(done);
    }, next);
  };

  this._close = function(next) {
    sequentialChannelOperations.push(function(done) {
      self._unsafeClose(done);
    }, next);
  };

  this._unsafeClose = function(next) {
    withCurrentChannel(function(channel, consumerTag) {
      debug('Cancelling subscriber session: %s on channel: %s', consumerTag, channel._rascal_id);
      channel.cancel(consumerTag, function(err) {
        if (err) return next(err);
        doom(consumerTag);
        next();
      });
    }, function() {
      debug('No current subscriber session');
      next();
    });
  };

  this._schedule = function(fn, delay) {
    timeout = setTimeout(fn, delay)
    if(timeout.unref)
      timeout = timeout.unref();
  };

  this._maxDeferCloseChannel = function(other) {
    return Math.max(config.deferCloseChannel, other) ;
  };

  this._getRascalChannelId = function() {
    var rascalChannelId = null;
    withCurrentChannel(function(channel, consumerTag) {
      rascalChannelId = channel._rascal_id;
    });
    return rascalChannelId;
  };

  this._ack = function(message, next) {
    withConsumerChannel(message.fields.consumerTag, function(channel) {
      debug('Acknowledging message: %s on channel: %s', message.properties.messageId, channel._rascal_id);
      channel.ack(message);
      setImmediate(next);
    }, function() {
      setImmediate(function() {
        next(new Error('The channel has been closed. Unable to ack message'));
      });
    });
  };

  this._nack = function(message, options, next) {
    if (arguments.length === 2) return self._nack(arguments[0], {}, arguments[1]);
    withConsumerChannel(message.fields.consumerTag, function(channel) {
      debug('Not acknowledging message: %s with requeue: %s on channel: %s', message.properties.messageId, !!options.requeue, channel._rascal_id);
      channel.nack(message, false, !!options.requeue);
      setImmediate(next);
    }, function() {
      setImmediate(function() {
        next(new Error('The channel has been closed. Unable to nack message'));
      });
    });
  };

  function withCurrentChannel(fn, altFn) {
    var entry = _.chain(channels).values().sortBy('index').last().value();
    if (entry) return fn(entry.channel, entry.consumerTag, entry);
    return altFn && altFn();
  }

  function withConsumerChannel(consumerTag, fn, altFn) {
    var entry = channels[consumerTag];
    if (entry) return fn(entry.channel, entry.consumerTag, entry);
    return altFn && altFn();
  }

  function unref(consumerTag) {
    withConsumerChannel(consumerTag, function(channel) {
      debug('Removing channel: %s from session', channel._rascal_id);
      delete channels[consumerTag];
    });
  }

  function doom(consumerTag) {
    withConsumerChannel(consumerTag, function(channel, consumerTag, entry) {
      if (entry.doomed) return;
      entry.doomed = true;
      scheduleClose(entry);
    });
  }

  /*
    There may still be delivered messages that have yet to be ack or nacked
    but no way of telling how many are outstanding since due to potentially
    complicated recovery strategies, with timeouts etc.
    Keeping channels around for a minute shouldn't hurt
  */
  function scheduleClose(entry) {
    debug('Deferring close channel: %s by %dms', entry.channel._rascal_id, config.deferCloseChannel);
    const t = setTimeout(function() {
      withConsumerChannel(entry.consumerTag, function(channel) {
        channel.close(function() {
          debug('Channel: %s was closed', channel._rascal_id);
        });
      });
    }, config.deferCloseChannel)
    if(t.unref)
      t.unref();
  }
}
