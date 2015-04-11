var debug = require('debug')('rascal:server')
var format = require('util').format
var _ = require('lodash').runInContext().mixin({ 'defaultsDeep': require('merge-defaults') })
var Broker = require('../lib/amqp/Broker')
var defaultConfig = require('../lib/config/defaults')
var uuid = require('node-uuid').v4()

var config = _.defaultsDeep({
    vhosts: {
        '/': {
            namespace: uuid,
            exchanges: {
                'e1': {
                    options: {
                        durable: false
                    }
                }
            },
            queues: {
                'q1': {
                    options: {
                        durable: false
                    }
                }
            },
            bindings: {
                'b1': {
                    source: 'e1',
                    destination: 'q1'
                }
            },
        }
    },
    publications: {
        'p1': {
            exchange: 'e1',
            confirm: true
        },
        'p2': {
            queue: 'q1',
            confirm: true
        }
    },
    subscriptions: {
        's1': {
            queue: 'q1'
        }
    }
}, defaultConfig)

var sent = 0
var received = 0

Broker.create(config, function(err, broker) {
    if (err) console.error(err) || process.exit(1)

    process.on('SIGINT', function() {
        broker.nuke(function() {
            console.log('Sent', sent)
            console.log('Received', received)
            process.exit()
        })
    })

    broker.on('error', function(err) {
        console.error('Error received from broker', err)
    })

    soakPublication(broker, 'p1')
    soakPublication(broker, 'p2')
    broker.subscribe('s1', function(err, message, content, next) {
        received++
        next()
    }, function(err) {
        if (err) console.error(err)
    }).on('error', function(err) {
        console.error('Error received from subscriber: s1', err)
    })

    debug('Come and have a go if you think you\'re hard enough')
})


function soakPublication(broker, publication, interval) {
    setInterval(function() {
        broker.publish(publication, 'This is a test message', function(err) {
            if (err) console.error(err.message)
            sent++
        }).on('error', function(err) {
            console.error(format('Error received from publisher: %s', publication), err)
        })
    }, interval || 100).unref()
}