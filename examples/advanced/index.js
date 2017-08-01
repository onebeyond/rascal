var Rascal = require('../..')
var config = require('./config')
var _ = require('lodash')
var Chance = require('Chance')
var chance = new Chance()

Rascal.Broker.create(Rascal.withDefaultConfig(config.rascal), function(err, broker) {
    if (err) bail(err)

    broker.on('error', function(err) {
        console.error(err.message)
    })

    _.each(broker.config.subscriptions, function(subscriptionConfig, subscriptionName) {

        var handler = require('./handlers/' + subscriptionConfig.handler)(broker)

        broker.subscribe(subscriptionName, function(err, subscription) {
            if (err) return bail(err)
            subscription
                .on('message', function(message, content, ackOrNack) {
                    handler(content, function(err) {
                        if (!err) return ackOrNack()
                        ackOrNack(err, err.recoverable ? broker.config.recovery.deferred_retry : broker.config.recovery.dead_letter)
                    })
                }).on('content_invalid', function(err, message, content, ackOrNack) {
                    console.errror('Invalid Content', err.message)
                    ackOrNack(err, config.recovery.dead_letter)
                }).on('redeliveries_exceeded', function(err, message, content, ackOrNack) {
                    console.error('Redeliveries Exceeded', err.message)
                    ackOrNack(err, config.recovery.dead_letter)
                }).on('error', function(err) {
                    console.error(err.message)
                })
        })
    })

    // Simulate a web app handling user registrations
    setInterval(function() {
        var user = { username: chance.first() + '_' + chance.last(), crash: randomInt(10) === 10 }
        var events = { 1: 'created', 2: 'updated', 3: 'deleted' }
        var event = events[randomInt(3)]
        var routingKey = format('registration_webapp.user.%s.%s', event, user.username)

        broker.publish('user_event', user, routingKey, function(err, publication) {
            if (err) return console.log(err.message)
            publication
                .on('success', function() {
                    // confirmed
                }).on('error', function(err) {
                    console.error(err.message)
                })
        })
    }, 1000)

    process.on('SIGINT', function() {
        broker.shutdown(function() {
            process.exit()
        })
    })
})

function randomInt(max) {
    return Math.floor(Math.random() * max) + 1
}


function bail(err) {
    console.error(err)
    process.exit(1)
}
