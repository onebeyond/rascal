var Rascal = require('../..')
var config = require('./config')
var format = require('util').format
var _ = require('lodash')
var chance = new require('Chance')()

Rascal.Broker.create(Rascal.withDefaultConfig(config.rascal), function(err, broker) {
    if (err) bail(err)

    broker.on('error', bail)

    _.each(broker.config.subscriptions, function(subscriptionConfig, subscriptionName) {

        var handler = require('./handlers/' + subscriptionConfig.handler)(broker)

        broker.subscribe(subscriptionName, function(err, subscription) {
            if (err) return bail(err)
            subscription
                .on('message', function(message, content, ackOrNack) {
                    handler(content, function(err) {
                        if (!err) return ackOrNack()
                        ackOrNack(err, err.recoverable ? broker.config.recovery.deferred_retry
                                                       : broker.config.recovery.dead_letter)
                    })
                }).on('content_invalid', function(err, message, content, ackOrNack) {
                    console.err(err.message)
                    ackOrNack(err, config.recovery.dead_letter)
                }).on('retries_exceeded', function(err, message, content, ackOrNack) {
                    console.err(err.message)
                    ackOrNack(err, config.recovery.dead_letter)
                }).on('error', function(err) {
                    console.log(err)
                })
        })
    })

    // Simulate a web app handling user registrations
    setInterval(function() {
        var user = { username: chance.first() + '_' + chance.last() }
        var events = { 0: 'created', 1: 'updated', 2: 'deleted' }
        var event = events[Math.floor(Math.random() * 3)]
        var routingKey = format('registration_webapp.user.%s.%s', event, user.username)

        broker.publish('user_event', user, routingKey, function(err, publication) {
            if (err) return console.log(err.message)
            publication.on('success', function() {
                // confirmed
            })
        })
    }, 1000)

    process.on('SIGINT', function() {
        broker.shutdown(function() {
            process.exit()
        })
    })
})




function bail(err) {
    console.error(err)
    process.exit(1)
}