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
    this.slow(2000)

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
                        destination: 'q1',
                        routingKey: 'foo'
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
        if (!broker) return done()
        broker.nuke(done)
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

    it('should consume auto acknowledged messages', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: 'v1',
                    exchange: 'e1',
                    routingKey: 'foo',
                    options: {

                    }
                }
            },
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
            publications: {
                p1: {
                    vhost: 'v1',
                    exchange: 'e1',
                    routingKey: 'foo',
                    options: {

                    }
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

    it('should not consume non-acknowledged messages with requeue', function(done) {

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

    function createBroker(config, next) {
        config = _.defaultsDeep(config, testConfig)
        Broker.create(config, function(err, _broker) {
            broker = _broker
            next(err, broker)
        })
    }
})