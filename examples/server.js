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
    if (err) bail(err)

    process.on('SIGINT', function() {
        broker.nuke(function() {
            console.log('Sent', sent)
            console.log('Received', received)
            process.exit()
        })
    })

    broker.on('error', bail)

    soakPublication(broker, 'p1')
    soakPublication(broker, 'p2')
    broker.subscribe('s1', function(err, subscription) {
        if (err) bail(err)
        subscription.on('message', function(message, content, ackOrNack) {
            console.log(content)
            received++
            ackOrNack()
        }).on('error', bail)
    })

    debug('Come and have a go if you think you\'re hard enough')
})


function soakPublication(broker, publication) {
    setInterval(function() {
        var message = format('%s: this is a test message from %s', new Date().toUTCString(), publication)
        broker.publish(publication, message, function(err, publication) {
            if (err) bail(err)
            publication.on('success', function() {
                sent++
            })
        })
    }, 1000).unref()
}

function bail(err) {
    console.error(err)
    process.exit(1)
}