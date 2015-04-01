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


describe('Vhost', function() {

    this.timeout(200000)
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

    it('should create exchanges', function(done) {
        var namespace = uuid()
        createBroker({
            vhosts: {
                v1: {
                    namespace: namespace,
                    exchanges: {
                        e1: {
                            assert: true
                        }
                    }
                }
            }
        }, function() {
            assertExchangePresent('e1', namespace, done)
        })
    })

    it('should create queues', function(done) {
        var namespace = uuid()
        createBroker({
            vhosts: {
                v1: {
                    namespace: namespace,
                    queues: {
                        q1: {
                            exclusive: false,
                            assert: true
                        }
                    }
                }
            }
        }, function() {
            assertQueuePresent('q1', namespace, done)
        })
    })

    it('should fail when checking a missing exchange', function(done) {

        createBroker({
            vhosts: {
                v1: {
                    exchanges: {
                        e1: {
                            assert: false,
                            check: true
                        }
                    }
                }
            }
        }, function(err) {
            assert.ok(err)
            assert.ok(/NOT-FOUND/.test(err.message), format('%s did not match the expected format', err.message))
            done()
        })
    })

    it('should fail when checking a missing queue', function(done) {

        createBroker({
            vhosts: {
                v1: {
                    queues: {
                        q1: {
                            assert: false,
                            check: true
                        }
                    }
                }
            }
        }, function(err) {
            assert.ok(err)
            assert.ok(/NOT-FOUND/.test(err.message), format('%s did not match the expected format', err.message))
            done()
        })
    })

    it('should create bindings', function(done) {

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
            }
        }, function(err) {
            assert.ifError(err)
            async.series({
                publish: publishMessage('e1', namespace, 'test message'),
                message: getMessage('q1', namespace)
            }, function(err, results) {
                assert.ifError(err)
                assert.ok(results.message)
                assert.equal(results.message, 'test message')
                done()
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