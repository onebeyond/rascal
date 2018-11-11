var debug = require('debug')('rascal:SubscriberError');
var format = require('util').format;
var _ = require('lodash');
var async = require('async');

module.exports = function SubscriptionRecovery(broker, vhost) {

  this.handle = function(session, message, err, recoveryProcess, next) {

    debug('Handling subscriber error for message: %s', message.properties.messageId);

    async.eachSeries([].concat(recoveryProcess || []).concat({ strategy: 'fallback-nack' }), function(recoveryConfig, cb) {
      debug('Attempting to recover message: %s using strategy: %s', message.properties.messageId, recoveryConfig.strategy);

      var once = _.once(cb);

      setTimeout(function() {
        getStrategy(recoveryConfig).execute(session, message, err, _.omit(recoveryConfig, 'defer'), function(err, handled) {
          if (err) {
            debug('Message: %s failed to be recovered using stragegy: %s', message.properties.messageId, recoveryConfig.strategy);
            return setImmediate(function() {
              next(err);
            });
          }
          if (handled) {
            debug('Message: %s was recovered using stragegy: %s', message.properties.messageId, recoveryConfig.strategy);
            return setImmediate(next);
          }
          once();
        });
      }, recoveryConfig.defer);
    }, next);
  };

  function getStrategy(recoveryConfig) {
    return recoveryStrategies[recoveryConfig.strategy] || recoveryStrategies.unknown;
  }

  var recoveryStrategies = _.keyBy([
    {
      name: 'ack',
      execute: function(session, message, err, strategyConfig, next) {
        session._ack(message, function(err) {
          next(err, true);
        });
      },
    },
    {
      name: 'nack',
      execute: function(session, message, err, strategyConfig, next) {
        session._nack(message, { requeue: strategyConfig.requeue }, function(err) {
          next(err, true);
        });
      },
    },
    {
      name: 'fallback-nack',
      execute: function(session, message, err, strategyConfig, next) {
        session._nack(message, { requeue: strategyConfig.requeue }, function(err) {
          next(err, true);
        });
      },
    },
    {
      name: 'republish',
      execute: function(session, message, err, strategyConfig, next) {
        debug('Republishing message: %s', message.properties.messageId);

        var originalQueue = _.get(message, 'properties.headers.rascal.originalQueue');
        var republished = _.get(message, format('properties.headers.rascal.recovery.%s.republished', originalQueue), 0);

        if (strategyConfig.attempts && strategyConfig.attempts <= republished) {
          debug('Skipping recovery - message: %s has already been republished %d times.', message.properties.messageId, republished);
          return next(null, false);
        }

        var publishOptions = _.cloneDeep(message.properties);
        _.set(publishOptions, format('headers.rascal.recovery.%s.republished', originalQueue), republished + 1);
        _.set(publishOptions, 'headers.rascal.originalExchange', message.fields.exchange);
        _.set(publishOptions, 'headers.rascal.originalRoutingKey', message.fields.routingKey);
        _.set(publishOptions, 'headers.rascal.error.message', _.truncate(err.message, { length: 1024 }));
        _.set(publishOptions, 'headers.rascal.error.code', err.code);
        if (strategyConfig.immediateNack) _.set(publishOptions, format('headers.rascal.recovery.%s.immediateNack', originalQueue), true);

        vhost.getConfirmChannel(function(err, publisherChannel) {

          if (err) return next(err);

          publisherChannel.on('error', next);

          publisherChannel.publish(undefined, originalQueue, message.content, publishOptions, function(err) {
            if (err) return next(err);   // Channel will already be closed, reclosing will trigger an error
            publisherChannel.close();
            debug('Message: %s was republished to queue: %s %d times', message.properties.messageId, originalQueue, republished + 1);
            session._ack(message, function(err) {
              next(err, true);
            });
          });
        });
      },
    },
    {
      name: 'forward',
      execute: function(session, message, err, strategyConfig, next) {
        debug('Forwarding message: %s', message.properties.messageId);

        var originalQueue = _.get(message, 'properties.headers.rascal.originalQueue');
        var forwarded = _.get(message, format('properties.headers.rascal.recovery.%s.forwarded', originalQueue), 0);

        if (strategyConfig.attempts && strategyConfig.attempts <= forwarded) {
          debug('Skipping recovery - message: %s has already been forwarded %d times.', message.properties.messageId, forwarded);
          return next(null, false);
        }

        // See https://github.com/rabbitmq/rabbitmq-server/issues/161
        if (strategyConfig.xDeathFix) delete message.properties.headers['x-death'];

        var forwardOptions = _.cloneDeep(strategyConfig.options) || {};
        _.set(forwardOptions, format('options.headers.rascal.recovery.%s.forwarded', originalQueue), forwarded + 1);
        _.set(forwardOptions, 'options.headers.rascal.error.message', _.truncate(err.message, { length: 1024 }));
        _.set(forwardOptions, 'options.headers.rascal.error.code', err.code);

        broker.forward(strategyConfig.publication, message, forwardOptions, function(err, publication) {
          if (err) return next(err);
          publication.on('success', function() {
            debug('Message: %s was forwarded to publication: %s %d times', message.properties.messageId, strategyConfig.publication, forwarded + 1);
            session._ack(message, function(err) {
              next(err, true);
            });
          })
            .on('error', next)
            .on('return', function() {
              next(new Error(format('Message: %s was forwared to publication: %s, but was returned', message.properties.messageId, strategyConfig.publication)));
            });
        });
      },
    },
    {
      name: 'unknown',
      execute: function(session, message, err, strategyConfig, next) {
        next(new Error(format('Error recovering message: %s. No such strategy: %s.', message.properties.messageId, strategyConfig.strategy)));
      },
    },
  ], 'name');
};
