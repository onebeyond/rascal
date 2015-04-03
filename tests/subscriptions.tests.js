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

    this.timeout(5000)
    this.slow(1000)

    var broker
    var amqputils
    var namespace
    var vhosts
    var publications
    var subscriptions

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
                        destination: 'q1',
                        routingKey: 'foo'
                    }
                }
            }
        }

        publications = {
            p1: {
                vhost: 'v1',
                exchange: 'e1',
                routingKey: 'foo'
            }
        }

        subscriptions = {
            s1: {
                vhost: 'v1',
                queue: 'q1'
            }
        }

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

    it('should consume to text messages', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
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

    it('should consume to JSON messages', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', { message: 'test message' }, function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, message, content) {
                    assert.ifError(err)
                    assert(message)
                    assert.equal(message.properties.contentType, 'application/json')
                    assert.equal(content.message, 'test message')
                    done()
                })
            })
        })
    })

    it('should consume to Buffer messages', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', new Buffer('test message'), function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, message, content) {
                    assert.ifError(err)
                    assert(message)
                    assert.equal(message.properties.contentType, undefined)
                    assert.equal(content, 'test message')
                    done()
                })
            })
        })
    })


    it('should force the content type when specified', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: {
                s1: {
                    vhost: 'v1',
                    queue: 'q1',
                    contentType: 'text/plain'
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', { message: 'test message' }, function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, message, content) {
                    assert.ifError(err)
                    assert(message)
                    assert.equal(message.properties.contentType, 'application/json')
                    assert.equal(content, '{\"message\":\"test message\"}')
                    done()
                })
            })
        })
    })

    it('should filter subscriptions by routing key', function(done) {

        this.slow(2000)

        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    exchange: 'e1',
                    routingKey: 'bar'
                }
            },
            subscriptions: subscriptions
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

    it('should consume auto acknowledged messages', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: {
                s1: {
                    vhost: 'v1',
                    queue: 'q1',
                    options: {
                        noAck: true
                    }
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)

                broker.subscribe('s1', function(err, message, content) {
                    assert.ifError(err)
                    assert.ok(message)
                    broker.shutdown(function(err) {
                        assert.ifError(err)
                        amqputils.assertMessageAbsent('q1', namespace, done)
                    })
                }, function(err, response) {
                    assert.ifError(err)
                })
            })
        })
    })

    it('should not consume unacknowledged messages', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)

                broker.subscribe('s1', function(err, message, content) {
                    assert.ifError(err)
                    assert.ok(message)
                    broker.shutdown(function(err) {
                        assert.ifError(err)
                        amqputils.assertMessage('q1', namespace, 'test message', done)
                    })
                }, function(err, response) {
                    assert.ifError(err)
                })
            })
        })
    })

    it('should consume acknowledged messages', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)

                broker.subscribe('s1', function(err, message, content, next) {
                    assert.ifError(err)
                    assert.ok(message)
                    next()
                    setTimeout(function() {
                        broker.shutdown(function(err) {
                            assert.ifError(err)
                            amqputils.assertMessageAbsent('q1', namespace, done)
                        })
                    }, 100).unref()
                }, function(err, response) {
                    assert.ifError(err)
                })
            })
        })
    })

    it('should consume non-acknowledged messages by default', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)

                broker.subscribe('s1', function(err, message, content, next) {
                    assert.ifError(err)
                    assert.ok(message)
                    next(new Error('fail'))
                    setTimeout(function() {
                        broker.shutdown(function(err) {
                            assert.ifError(err)
                            amqputils.assertMessageAbsent('q1', namespace, done)
                        })
                    }, 100).unref()
                }, function(err, response) {
                    assert.ifError(err)
                })
            })
        })
    })

    it('should requeue messages when requested', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)

                var messages = {}
                broker.subscribe('s1', function(err, message, content, next) {
                    assert.ifError(err)
                    assert.ok(message)
                    messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1
                    if (messages[message.properties.messageId] < 10) return next(new Error('retry'), { requeue: true })
                    done()
                }, function(err, response) {
                    assert.ifError(err)
                })
            })
        })
    })

    it('should defer requeued messages when requested', function(done) {

        this.slow(3000)

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)

                var numberOfMessages = 0
                var startTime = new Date().getTime()
                broker.subscribe('s1', function(err, message, content, next) {
                    assert.ifError(err)
                    assert.ok(message)
                    numberOfMessages++
                    if (numberOfMessages < 10) return next(new Error('retry'), { requeue: true, defer: 100 })
                    var stopTime = new Date().getTime()
                    assert.ok((stopTime - startTime) >= 900, 'Retry was not deferred')
                    done()
                }, function(err, response) {
                    assert.ifError(err)
                })
            })
        })
    })

    it('should limit concurrent messages using prefetch', function(done) {

        this.slow(2000)

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: {
                s1: {
                    vhost: 'v1',
                    queue: 'q1',
                    prefetch: 5
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            async.times(10, function(index, next) {
                broker.publish('p1', 'test message', next)
            }, function(err) {
                assert.ifError(err)
                var messages = 0
                broker.subscribe('s1', function(err, message, content) {
                    assert.ifError(err)
                    assert(message)
                    messages++
                    if (messages == 5) {
                        setTimeout(function() {
                            assert.equal(messages, 5)
                            done()
                        }, 500)
                    }
                })
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