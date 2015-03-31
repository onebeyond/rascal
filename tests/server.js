var debug = require('debug')('amqp-nice:server')
var _ = require('lodash').runInContext()
var Broker = require('../lib/amqp/Broker')
var defaultConfig = require('../lib/config/defaults')
var uuid = require('node-uuid').v4()

_.mixin({ 'defaultsDeep': require('merge-defaults') });

var config = _.defaultsDeep({
    vhosts: {
        'v1': {
            namespace: uuid,
            exchanges: {
                'e1': {
                    durable: false
                }
            },
            queues: {
                'q1': {
                    durable: false
                }
            },
            bindings: {
                "b1": {
                    source: 'e1',
                    destination: 'q1',
                    routingKey: '#'
                }
            },
        }
    },
    publications: {
        'p1': {
            exchange: 'e1',
            vhost: 'v1',
            confirm: true
        },
        'p2': {
            queue: 'q1',
            vhost: 'v1',
            confirm: true
        }
    }
}, defaultConfig)

var sent = 0

Broker.create(config, function(err, broker) {
    if (err) console.error(err) || process.exit(1)
    broker.on('error', function(err) {})
    process.on('SIGINT', function() {
        broker.nuke(function() {
            console.log('Sent', sent)
            process.exit()
        })
    })
    setInterval(function() {
        broker.publish('p1', 'This is a test message', function(err) {
            if (err) console.error(err.message)
            sent++
        })
    }, 1000).unref()
    setInterval(function() {
        broker.publish('p2', 'This is a test message', function(err) {
            if (err) console.error(err.message)
            sent++
        })
    }, 1000).unref()
    debug('Come and have a go if you think you\'re hard enough')
})