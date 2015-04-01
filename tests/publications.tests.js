var debug = require('debug')('amqp-nice:config:tests')
var assert = require('assert')
var _ = require('lodash').runInContext()
var async = require('async')
var amqplib = require('amqplib/callback_api')
var testConfig = require('../lib/config/tests')
var format = require('util').format
var uuid = require('node-uuid').v4
var Broker = require('..').Broker

_.mixin({ 'defaultsDeep': require('merge-defaults') });


describe('Publications', function() {

    this.timeout(2000)
    this.slow(1000)

    var broker = undefined
    var testConnection = undefined

    before(function(done) {
        amqplib.connect(function(err, connection) {
            if (err) return done(err)
            testConnection = connection
            done()
        })
    })

    after(function(done) {
        if (broker) return broker.nuke(done)
        done()
    })

    it('should publish text messages to normal exchanges', function(done) {

        var namespace = uuid()

        createBroker({
            vhosts: {
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
                            destination: 'q1'
                        }
                    }
                }
            },
            publications: {
                p1: {
                    vhost: 'v1',
                    exchange: 'e1'
                }
            }
        }, function(err, broker) {
            if (err) return next(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)
                getMessage('q1', namespace, function(err, message) {
                    assert.ifError(err)
                    assert.ok(message)
                    assert.equal(message, 'test message')
                    done()
                })
            })
        })
    })


    it('should publish to confirm exchanges')
    it('should publish to queues')
    it('should publish to confirm queues')


    function createBroker(config, next) {
        config = _.defaultsDeep(config, testConfig)
        Broker.create(config, function(err, _broker) {
            broker = _broker
            next(err, broker)
        })
    }

    function checkExchange(present, name, namespace, next) {
        testConnection.createChannel(function(err, channel) {
            assert.ifError(err)
            channel.checkExchange(namespace + ':' + name, function(err, ok) {
                present ? assert(!err) : assert(!!err)
                next()
            })
        })
    }

    function checkQueue(present, name, namespace, next) {
        testConnection.createChannel(function(err, channel) {
            assert.ifError(err)
            channel.checkQueue(namespace + ':' + name, function(err, ok) {
                present ? assert(!err) : assert(!!err)
                next()
            })
        })
    }

    var publishMessage = _.curry(function(exchange, namespace, message, next) {
        testConnection.createChannel(function(err, channel) {
            assert.ifError(err)
            channel.publish(namespace + ':' + exchange, '', new Buffer(message))
            next()
        })
    })

    var getMessage = _.curry(function(queue, namespace, next) {
         testConnection.createChannel(function(err, channel) {
            assert.ifError(err)
            channel.get(namespace + ':' + queue, { noAck: true }, function(err, message) {
                if (err) return next(err)
                next(null, message.content.toString())
            })
        })
    })


    var assertExchangePresent = checkExchange.bind(null, true)
    var assertExchangeAbsent = checkExchange.bind(null, false)
    var assertQueuePresent = checkQueue.bind(null, true)
    var assertQueueAbsent = checkQueue.bind(null, false)

})