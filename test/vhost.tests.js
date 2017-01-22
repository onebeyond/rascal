var assert = require('assert')
var _ = require('lodash').runInContext().mixin({ 'defaultsDeep': require('merge-defaults') });
var amqplib = require('amqplib/callback_api')
var testConfig = require('../lib/config/tests')
var format = require('util').format
var uuid = require('uuid').v4
var Broker = require('..').Broker
var AmqpUtils = require('./utils/amqputils')

describe('Vhost', function() {

    this.timeout(2000)
    this.slow(1000)

    var broker
    var amqputils

    beforeEach(function(done) {
        amqplib.connect(function(err, connection) {
            if (err) return done(err)
            amqputils = AmqpUtils.init(connection)
            done()
        })
    })

    afterEach(function(done) {
        if (!broker) return done()
        broker.nuke(done)
    })

    it('should create exchanges', function(done) {
        var namespace = uuid()
        createBroker({
            vhosts: {
                '/': {
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
                '/': {
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
                '/': {
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
                '/': {
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
                '/': {
                    namespace: namespace,
                    exchanges: {
                        e1: {
                            assert: true
                        },
                        e2: {
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
                            destination: 'e2',
                            destinationType: 'exchange'
                        },
                        b2: {
                            source: 'e1',
                            destination: 'q1'
                        }
                    }
                }
            }
        }, function(err) {
            assert.ifError(err)
            amqputils.publishMessage('e1', namespace, 'test message', {}, function(err) {
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