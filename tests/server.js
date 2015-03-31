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
                'e1': {}
            },
            queues: {
                'q1': {}
            },
            bindings: {
                "b1": {
                    source: 'e1',
                    destination: 'q1'
                }
            },
        }
    },
    publications: {
        'p1': {
            exchange: 'e1',
            vhost: 'v1'
        }
    }
}, defaultConfig)

Broker.create(config, function(err, broker) {
    if (err) console.error(err) || process.exit(1)
    broker.on('error', function(err) {})
    process.on('SIGINT', function() {
        broker.nuke(function() {
            process.exit()
        })
    })
    var unref = setInterval(function() {
        broker.publish('p1', 'This is a test message', function() {})
    }, 1000)
    debug('Come and have a go if you think you\'re hard enough')
})