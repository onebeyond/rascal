var debug = require('debug')('amqp-nice:publish:tests')
var assert = require('assert')
var async = require('async')
var client = require('..')
var uuid = require('node-uuid').v4

describe('Client', function() {

    this.timeout(1000)
    this.slow(500)

    var broker
    var namespace

    beforeEach(function(done) {
        namespace = uuid()

        client.init({
            namespace: namespace,
            defaults: {
                exchanges: {
                    options: {
                        durable: false
                    }
                },
                queues: {
                    options: {
                        durable: false,
                        exclusive: true
                    }
                }
            },
            exchanges: {
                'ex1': {}
            },
            queues: {
                'q1': {}
            },
            bindings: {
                'b1': {
                    source: 'ex1',
                    destination: 'q1',
                    destinationType: 'queue',
                    routingKey: '#'
                }
            },
            publications: {
                'p1': {
                    confirm: false,
                    exchange: 'ex1',
                    routingKey: 'rk.1',
                },
                'p2': {
                    confirm: true,
                    exchange: 'ex1',
                    routingKey: 'rk.2'
                },
                'p3': {
                    confirm: true,
                    queue: 'q1',
                    routingKey: 'rk.2'
                }
            }
        }, function(err, _broker) {
            broker = _broker
            done(err)
        })
    })

    afterEach(function(done) {
        broker.nuke(done)
    })

    it.only('should publish a text message to an exchange using an normal channel', function(done) {

        broker.publish('p1', 'routing.key', 'text message')

        assertMessage('q1', 'text message', done)
    })

    function assertMessage(queue, message, done) {
        broker.connction.createChannel(function(err, channel) {
            assert.ifError(err)
            channel.get(queue, { noAck: true }, function(err, message) {
                assert.ifError(err)
                assert(message)
                assert.equal(new String(message.content))
            })
        })
    }
})