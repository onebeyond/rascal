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


describe('Vhost', function() {

    this.timeout(2000)
    this.slow(1000)

    var broker = undefined
    var amqputils = undefined

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
            amqputils.assertExchangePresent('e1', namespace, done)
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
                            assert: true
                        }
                    }
                }
            }
        }, function() {
            amqputils.assertQueuePresent('q1', namespace, done)
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
            amqputils.publishMessage('e1', namespace, 'test message', function(err) {
                assert.ifError(err)
                amqputils.assertMessage('q1', namespace, 'test message', done)
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