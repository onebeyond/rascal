var debug = require('debug')('rascal:SubscriptionError')
var format = require('util').format
var _ = require('lodash').mixin({ 'defaultsDeep': require('merge-defaults') })
var async = require('async')

module.exports = function SubscriptionRecovery(vhost) {

    this.handle = function(session, message, recoveryProcess, next) {

        debug('Handling subscriber error for message: %s', message.properties.messageId)

        async.eachSeries([].concat(recoveryProcess), function(recoveryConfig, cb) {
            debug('Attempting to recover message: %s using strategy: %s', message.properties.messageId, recoveryConfig.strategy)

            setTimeout(function() {
                getStrategy(recoveryConfig).execute(session, message, _.omit(recoveryConfig, 'defer'), function(err, executed) {
                    if (err) session.emit('error', err)
                    if (executed) {
                        debug('Message %s: was recovered using stagegy: %s', message.properties.messageId, recoveryConfig.strategy)
                        return next()
                    }
                    cb()
                })
            }, recoveryConfig.defer)
        }, next)
    }

    function getStrategy(recoveryConfig) {
        return recoveryStrategies[recoveryConfig.strategy] || recoveryStrategies.unknown
    }

    var recoveryStrategies = _.indexBy([
        {
            name: 'ack',
            execute: function(session, message, next) {
                session._ack(message)
                next(null, true)
            }
        },
        {
            name: 'nack',
            execute: function(session, message, strategyConfig, next) {
                session._nack(message, strategyConfig.options)
                next(null, true)
            }
        },
        {
            name: 'republish',
            execute: function(session, message, strategyConfig, next) {
                debug('Republishing message: %s', message.properties.messageId)

                var republished = message.properties.headers.rascal && message.properties.headers.rascal.republished || 0

                if (strategyConfig.options && strategyConfig.options.attempts && strategyConfig.options.attempts <= republished) {
                    debug('Message: %s has been republished %d times.', message.properties.messageId, republished)
                    return next(null, false)
                }

                var publishOptions = _.defaultsDeep(message.properties, { headers: { rascal: {} } })
                publishOptions.headers.rascal.republished = republished + 1
                publishOptions.headers.rascal.originalExchange = message.fields.exchange
                publishOptions.headers.rascal.originalRoutingKey = message.fields.routingKey

                vhost.getConfirmChannel(function(err, publisherChannel) {

                    publisherChannel.on('error', function(err) {
                        session.emit('error', err)
                    })

                    publisherChannel.publish(undefined, message.properties.headers.rascal.originalQueue, message.content, publishOptions, function(err) {
                        if (err) return next(err)
                        debug('Message: %s was republished to %s', message.properties.messageId, message.properties.headers.rascal.originalQueue)
                        session._ack(message)
                        next(null, true)
                    })
                })
            }
        },
        {
            name: 'fallback',
            execute: function(session, message, strategyConfig, next) {
                session._nack(message, {})
                next(null, true)
            }
        },
        {
            name: 'unknown',
            execute: function(session, message, strategyConfig, next) {
                session.emit('error', new Error(format('Error recovering message: %s. No such strategy: %s.', message.properties.messageId, strategyConfig.name)))
                next()
            }
        }
    ], 'name')
}

