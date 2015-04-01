var debug = require('debug')('amqp-nice:config:tests')
var assert = require('assert')
var _ = require('lodash').runInContext()
var async = require('async')
var amqplib = require('amqplib/callback_api')
var testConfig = require('../lib/config/tests')
var format = require('util').format
var uuid = require('node-uuid').v4
var Broker = require('..').Broker
var AmqpUtils = require('./utils/amqputils')


_.mixin({ 'defaultsDeep': require('merge-defaults') });


describe('Subscriptions', function() {

    this.timeout(2000)
    this.slow(1000)

    var broker = undefined
    var amqputils = undefined
    var namespace = uuid()

    var vhosts = {
        v1: {
            namespace: namespace,
            exchanges: {
                e1: {
                    assert: true
                }
            },
            queues: {
                q1: {
                    exclusive: false,
                    assert: true
                }
            },
            bindings: {
                b1: {
                    source: 'e1',
                    destination: 'q1',
                    routingKey: 'foo'
                }
            }
        }
    }

    before(function(done) {
        amqplib.connect(function(err, connection) {
            if (err) return done(err)
            amqputils = AmqpUtils.init(connection)
            done()
        })
    })

    after(function(done) {
        if (broker) return broker.nuke(done)
        done()
    })

    it('should subscribe to text messages', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    exchange: 'e1',
                    routingKey: 'foo'
                }
            },
            subscriptions: {
                s1: {
                    vhost: 'v1',
                    queue: 'q1'
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, message, content) {
                    assert.ifError(err)
                    assert(message)
                    assert.equal(message.properties.contentType, 'text/plain')
                    assert.equal(content, 'test message')
                    done()
                })
            })
        })
    })

    it('should filter subscriptions by routing key', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    exchange: 'e1',
                    routingKey: 'bar'
                }
            },
            subscriptions: {
                s1: {
                    vhost: 'v1',
                    queue: 'q1'
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function() {
                    assert.ok(false, 'Should not have received any messages')
                })
                setTimeout(done, 500)
            })
        })
    })


    function createBroker(config, next) {
        config = _.defaultsDeep(config, testConfig)
        Broker.create(config, function(err, _broker) {
            broker = _broker
            next(err, broker)
        })
    }
})