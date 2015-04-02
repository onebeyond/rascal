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


describe('Publications', function() {

    this.timeout(2000)
    this.slow(1000)

    var broker = undefined
    var amqputils = undefined
    var namespace = undefined
    var vhosts = undefined

    beforeEach(function(done) {

        namespace = uuid()

        vhosts = {
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

        amqplib.connect(function(err, connection) {
            if (err) return done(err)
            amqputils = AmqpUtils.init(connection)
            done()
        })
    })

    afterEach(function(done) {
        if (broker) return broker.nuke(done)
        done()
    })

    it('should publish text messages to normal exchanges', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    exchange: 'e1'
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)
                amqputils.assertMessage('q1', namespace, 'test message', done)
            })
        })
    })

    it('should publish text messages to confirm exchanges', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    exchange: 'e1',
                    confirm: true
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err, ok) {
                assert.ifError(err)
                amqputils.assertMessage('q1', namespace, 'test message', done)
            })
        })
    })

    it('should publish text messages to queues', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    queue: 'q1'
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err, ok) {
                assert.ifError(err)
                amqputils.assertMessage('q1', namespace, 'test message', done)
            })
        })
    })

    it('should decorate the message with a uuid', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    exchange: 'e1'
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err, messageId) {
                assert.ifError(err)
                assert.ok(/\w+-\w+-\w+-\w+-\w+/.test(messageId), format('%s failed to match expected pattern', messageId))

                amqputils.getMessage('q1', namespace, function(err, message) {
                    assert.ifError(err)
                    assert.ok(message)
                    assert.equal(messageId, message.properties.messageId)
                    done()
                })
            })
        })
    })

    it('should publish to confirm queues', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    queue: 'q1',
                    confirm: true
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err, ok) {
                assert.ifError(err)
                amqputils.assertMessage('q1', namespace, 'test message', done)
            })
        })
    })

    it('should publish json messages to normal exchanges', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    exchange: 'e1'
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', { message: 'test message' }, function(err) {
                assert.ifError(err)
                amqputils.assertMessage('q1', namespace, JSON.stringify({ message: 'test message' }), done)
            })
        })
    })


    it('should publish buffer messages to normal exchanges', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    exchange: 'e1'
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', new Buffer('test message'), function(err) {
                assert.ifError(err)
                amqputils.assertMessage('q1', namespace, 'test message', done)
            })
        })
    })

    it('should allow publish overrides', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    queue: 'q1'
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', { options: { expiration: 1 } }, function(err, ok) {
                assert.ifError(err)
                setTimeout(function() {
                    amqputils.assertMessageAbsent('q1', namespace, done)
                }, 100)
            })
        })
    })

    it('should publish without overrides or a callback', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    queue: 'q1',
                    confirm: true
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message')
            setTimeout(function() {
                amqputils.assertMessage('q1', namespace, 'test message', done)
            }, 400)
        })
    })

    it('should publish with overrides, but no callback', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    queue: 'q1',
                    confirm: true
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', {})
            setTimeout(function() {
                amqputils.assertMessage('q1', namespace, 'test message', done)
            }, 400)
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