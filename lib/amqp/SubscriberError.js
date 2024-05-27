const debug = require('debug')('rascal:SubscriberError');
const format = require('util').format;
const _ = require('lodash');
const async = require('async');
const setTimeoutUnref = require('../utils/setTimeoutUnref');
const { EMPTY_X_DEATH } = require('./XDeath');

module.exports = function SubscriptionRecovery(broker, vhost) {
  this.handle = function (session, message, err, recoveryOptions, next) {
    debug('Handling subscriber error for message: %s with error: %s', message.properties.messageId, err.message);

    async.eachSeries(
      [].concat(recoveryOptions || []).concat({ strategy: 'fallback-nack' }),
      (recoveryConfig, cb) => {
        debug('Attempting to recover message: %s using strategy: %s', message.properties.messageId, recoveryConfig.strategy);

        const once = _.once(cb);

        setTimeoutUnref(() => {
          getStrategy(recoveryConfig).execute(session, message, err, _.omit(recoveryConfig, 'defer'), (err, handled) => {
            if (err) {
              debug('Message: %s failed to be recovered using stragegy: %s', message.properties.messageId, recoveryConfig.strategy);
              setImmediate(() => next(err));
              return once(false);
            }
            if (handled) {
              debug('Message: %s was recovered using stragegy: %s', message.properties.messageId, recoveryConfig.strategy);
              setImmediate(next);
              return once(false);
            }
            once();
          });
        }, recoveryConfig.defer);
      },
      next,
    );
  };

  const recoveryStrategies = _.keyBy(
    [
      {
        name: 'ack',
        execute(session, message, err, strategyConfig, next) {
          const ackFn = strategyConfig.all ? session._nackAll.bind(session) : session._nack.bind(session);
          ackFn(message, (err) => {
            next(err, true);
          });
        },
      },
      {
        name: 'nack',
        execute(session, message, err, strategyConfig, next) {
          const nackFn = strategyConfig.all ? session._nackAll.bind(session) : session._nack.bind(session);
          nackFn(message, { requeue: strategyConfig.requeue }, (err) => {
            next(err, true);
          });
        },
      },
      {
        name: 'fallback-nack',
        execute(session, message, err, strategyConfig, next) {
          session._nack(message, { requeue: strategyConfig.requeue }, (err) => {
            next(err, true);
          });
        },
      },
      {
        name: 'republish',
        execute(session, message, err, strategyConfig, next) {
          debug('Republishing message: %s', message.properties.messageId);

          const originalQueue = _.get(message, 'properties.headers.rascal.originalQueue');
          const republished = _.get(message, ['properties', 'headers', 'rascal', 'recovery', originalQueue, 'republished'], 0);

          if (strategyConfig.attempts && strategyConfig.attempts <= republished) {
            debug('Skipping recovery - message: %s has already been republished %d times.', message.properties.messageId, republished);
            return next(null, false);
          }

          const publishOptions = _.cloneDeep(message.properties);
          _.set(publishOptions, ['headers', 'rascal', 'recovery', originalQueue, 'republished'], republished + 1);
          _.set(publishOptions, 'headers.rascal.originalExchange', message.fields.exchange);
          _.set(publishOptions, 'headers.rascal.originalRoutingKey', message.fields.routingKey);
          _.set(publishOptions, 'headers.rascal.error.message', _.truncate(err.message, { length: 1024 }));
          _.set(publishOptions, 'headers.rascal.error.code', err.code);
          _.set(publishOptions, 'headers.rascal.restoreRoutingHeaders', _.has(strategyConfig, 'restoreRoutingHeaders') ? strategyConfig.restoreRoutingHeaders : true);

          if (strategyConfig.immediateNack) {
            const xDeathRecords = message.properties.headers['x-death'] || [];
            const xDeath = xDeathRecords.find(({ queue, reason }) => queue === originalQueue && reason === 'rejected') || EMPTY_X_DEATH;
            _.set(publishOptions, ['headers', 'rascal', 'recovery', originalQueue], { immediateNack: true, xDeath });
          }

          const ackMessage = () => {
            session._ack(message, (err) => {
              next(err, true);
            });
          };

          const nackMessage = (err) => {
            session._nack(message, (_nackErr) => {
              // nackError just means the channel was already closed meaning the original message would have been rolled back
              next(err);
            });
          };

          const ackOrNack = _.once((err) => {
            return err ? nackMessage(err) : ackMessage();
          });

          vhost.getConfirmChannel((err, publisherChannel) => {
            if (err) return ackOrNack(err);

            if (!publisherChannel) return ackOrNack(new Error('Unable to handle subscriber error by republishing. The VHost is shutting down'));

            publisherChannel.on('error', (err) => {
              ackOrNack(err);
            });

            publisherChannel.on('return', () => {
              ackOrNack(new Error(format('Message: %s was republished to queue: %s, but was returned', message.properties.messageId, originalQueue)));
            });

            publisherChannel.publish(undefined, originalQueue, message.content, publishOptions, (err) => {
              if (err) {
                // Channel will already be closed, reclosing will trigger an error
                publisherChannel.removeAllListeners();

                debug('Message: %s failed to be republished to queue: %s %d times - %s', message.properties.messageId, originalQueue, republished + 1, err.message);
                ackOrNack(err);
              } else {
                publisherChannel.close();
                publisherChannel.removeAllListeners();

                debug('Message: %s was republished to queue: %s %d times', message.properties.messageId, originalQueue, republished + 1);
                ackOrNack();
              }
            });
          });
        },
      },
      {
        name: 'forward',
        execute(session, message, err, strategyConfig, next) {
          debug('Forwarding message: %s to publication: %s', message.properties.messageId, strategyConfig.publication);

          const originalQueue = _.get(message, 'properties.headers.rascal.originalQueue');
          const forwarded = _.get(message, ['properties', 'headers', 'rascal', 'recovery', originalQueue, 'forwarded'], 0);

          if (strategyConfig.attempts && strategyConfig.attempts <= forwarded) {
            debug('Skipping recovery - message: %s has already been forwarded %d times.', message.properties.messageId, forwarded);
            return next(null, false);
          }

          // See https://github.com/rabbitmq/rabbitmq-server/issues/161
          if (strategyConfig.xDeathFix) delete message.properties.headers['x-death'];

          const forwardOverrides = _.cloneDeep(strategyConfig.options) || {};
          _.set(forwardOverrides, 'restoreRoutingHeaders', _.has(strategyConfig, 'restoreRoutingHeaders') ? strategyConfig.restoreRoutingHeaders : true);
          _.set(forwardOverrides, ['options', 'headers', 'rascal', 'recovery', originalQueue, 'forwarded'], forwarded + 1);
          _.set(forwardOverrides, 'options.headers.rascal.error.message', _.truncate(err.message, { length: 1024 }));
          _.set(forwardOverrides, 'options.headers.rascal.error.code', err.code);

          const ackMessage = () => {
            session._ack(message, (err) => {
              next(err, true);
            });
          };

          const nackMessage = (err) => {
            session._nack(message, (_nackErr) => {
              // nackError just means the channel was already closed meaning the original message would have been rolled back
              next(err);
            });
          };

          const ackOrNack = _.once((err) => {
            return err ? nackMessage(err) : ackMessage();
          });

          broker.forward(strategyConfig.publication, message, forwardOverrides, (err, publication) => {
            if (err) return nackMessage(err);

            publication.on('success', () => {
              debug('Message: %s was forwarded to publication: %s %d times', message.properties.messageId, strategyConfig.publication, forwarded + 1);
              ackOrNack();
            });

            publication.on('error', (err) => {
              debug('Message: %s failed to be forwarded to publication: %s %d times - %s', message.properties.messageId, strategyConfig.publication, forwarded + 1, err.message);
              ackOrNack(err);
            });

            publication.on('return', () => {
              publication.removeAllListeners('success');
              ackOrNack(new Error(format('Message: %s was forwarded to publication: %s, but was returned', message.properties.messageId, strategyConfig.publication)));
            });
          });
        },
      },
      {
        name: 'unknown',
        execute(session, message, err, strategyConfig, next) {
          session._nack(message, () => {
            next(new Error(format('Error recovering message: %s. No such strategy: %s.', message.properties.messageId, strategyConfig.strategy)));
          });
        },
      },
    ],
    'name',
  );

  function getStrategy(recoveryConfig) {
    return recoveryStrategies[recoveryConfig.strategy] || recoveryStrategies.unknown;
  }
};
