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
    this.slow(undefined)

    var broker
    var amqputils
    var namespace
    var vhosts
    var publications
    var subscriptions

    beforeEach(function(done) {

        namespace = uuid()
        vhosts = {
            '/': {
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
                        destination: 'q1',
                        bindingKey: 'foo'
                    }
                }
            }
        }

        publications = {
            p1: {
                vhost: '/',
                exchange: 'e1',
                routingKey: 'foo'
            }
        }

        subscriptions = {
            s1: {
                vhost: '/',
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

    it('should report unknown subscriptions', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.subscribe('does-not-exist', function(err, subscription) {
                assert.ok(err)
                assert.equal(err.message, 'Unknown subscription: does-not-exist')
                done()
            })
        })
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
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert(message)
                        assert.equal(message.properties.contentType, 'text/plain')
                        assert.equal(content, 'test message')
                        done()
                    })
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
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert(message)
                        assert.equal(message.properties.contentType, 'application/json')
                        assert.equal(content.message, 'test message')
                        done()
                    })
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
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert(message)
                        assert.equal(message.properties.contentType, undefined)
                        assert.equal(content, 'test message')
                        done()
                    })
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
                    vhost: '/',
                    queue: 'q1',
                    contentType: 'text/plain'
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', { message: 'test message' }, function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert(message)
                        assert.equal(message.properties.contentType, 'application/json')
                        assert.equal(content, '{\"message\":\"test message\"}')
                        done()
                    })
                })
            })
        })
    })

    it('should filter subscriptions by routing key', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: {
                p1: {
                    vhost: '/',
                    exchange: 'e1',
                    routingKey: 'bar'
                }
            },
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert.ok(false, 'Should not have received any messages')
                    })
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
                    vhost: '/',
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

                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert.ok(message)
                        broker.shutdown(function(err) {
                            assert.ifError(err)
                            amqputils.assertMessageAbsent('q1', namespace, done)
                        })
                    })
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

                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert.ok(message)
                        broker.shutdown(function(err) {
                            assert.ifError(err)
                            amqputils.assertMessage('q1', namespace, 'test message', done)
                        })
                    })
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

                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert.ok(message)
                        ackOrNack()
                        setTimeout(function() {
                            broker.shutdown(function(err) {
                                assert.ifError(err)
                                amqputils.assertMessageAbsent('q1', namespace, done)
                            })
                        }, 100).unref()
                    })
                })
            })
        })
    })

    it('should consume rejected messages by default', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)

                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert.ok(message)
                        ackOrNack(new Error('reject'))
                        setTimeout(function() {
                            broker.shutdown(function(err) {
                                assert.ifError(err)
                                amqputils.assertMessageAbsent('q1', namespace, done)
                            })
                        }, 100).unref()
                    })
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
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert.ok(message)
                        messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1
                        if (messages[message.properties.messageId] < 10) return ackOrNack(new Error('retry'), { requeue: true })
                        done()
                    })
                })
            })
        })
    })

    it('should defer requeueing messages when requested', function(done) {

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
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert.ok(message)
                        numberOfMessages++
                        if (numberOfMessages < 10) return ackOrNack(new Error('retry'), { requeue: true, defer: 100 })
                        var stopTime = new Date().getTime()
                        assert.ok((stopTime - startTime) >= 900, 'Retry was not deferred')
                        done()
                    })
                })
            })
        })
    })

    it('should republish messages to queue when requested', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)

                var messages = {}
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert.ok(message)
                        messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1
                        if (messages[message.properties.messageId] < 10) return ackOrNack(new Error('republish'), { republish: true })
                        assert.equal(message.properties.headers.rascal.republished, 9)
                        done()
                    })
                })
            })
        })
    })

    it('should maintain original fields, properties and headers when republished', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', { options: { persistent: true, headers: { foo: 'bar' } } }, function(err, publication) {
                assert.ifError(err)

                publication.on('success', function(messageId) {
                    var messages = {}
                    broker.subscribe('s1', function(err, subscription) {
                        assert.ifError(err)
                        subscription.on('message', function(message, content, ackOrNack) {
                            assert.ok(message)
                            messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1
                            if (messages[message.properties.messageId] < 2) return ackOrNack(new Error('republish'), { republish: true })
                            assert.equal(message.properties.headers.rascal.republished, 1)
                            assert.equal(message.properties.headers.foo, 'bar')
                            assert.equal(message.properties.messageId, messageId)
                            assert.equal(message.fields.routingKey, 'foo')
                            assert.equal(message.properties.deliveryMode, 2)
                            done()
                        })
                    })
                })
            })
        })
    })

    it('should cap republishes when requested', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', assert.ifError)

            var count = 0
            broker.subscribe('s1', function(err, subscription) {
                assert.ifError(err)
                subscription.on('message', function(message, content, ackOrNack) {
                    count++
                    ackOrNack(new Error('republish'), { republish: true, attempts: 5 })
                })
            })

            setTimeout(function() {
                assert.equal(count, 6)
                done()
            }, 500)

        })
    })

    it('should defer republishing messages when requested', function(done) {

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
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert.ok(message)
                        numberOfMessages++
                        if (numberOfMessages < 10) return ackOrNack(new Error('republish'), { republish: true, defer: 100 })
                        var stopTime = new Date().getTime()
                        assert.ok((stopTime - startTime) >= 900, 'Republish was not deferred')
                        done()
                    })
                })
            })
        })
    })

    it('should limit concurrent messages using prefetch', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: {
                s1: {
                    vhost: '/',
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
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                        subscription.on('message', function(message, content, ackOrNack) {
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
    })

    it('should consume to messages from a replyTo queue', function(done) {
        var replyTo = uuid()
        createBroker({
            vhosts: {
                '/': {
                    namespace: namespace,
                    exchanges: {
                        e1: {
                            assert: true
                        }
                    },
                    queues: {
                        q1: {
                            assert: true,
                            replyTo: replyTo
                        }
                    },
                    bindings: {
                        b1: {
                            source: 'e1',
                            destination: 'q1',
                            bindingKey: 'foo.#'
                        }
                    }
                }
            },
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', replyTo + '.foo.bar', function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert(message)
                        assert.equal(content, 'test message')
                        done()
                    })
                })
            })
        })
    })

    it('should emit channel errors', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)
                broker.subscribe('s1', { retry: false }, function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        ackOrNack()
                        ackOrNack() // trigger a channel error
                    }).on('error', function(err) {
                        assert.ok(err)
                        assert.equal('Channel closed by server: 406 (PRECONDITION-FAILED) with message "PRECONDITION_FAILED - unknown delivery tag 1"', err.message)
                        done()
                    })
                })
            })
        })
    })

    it('should not consume messages after unsubscribing', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: {
                s1: {
                    vhost: '/',
                    queue: 'q1',
                    options: {
                        noAck: true
                    }
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.subscribe('s1', function(err, subscription) {
                assert.ifError(err)

                subscription.on('message', function(message, content, ackOrNack) {
                    assert.ok(false, 'Should not receive messages after unsubscribing')
                })

                subscription.cancel(function(err) {
                    assert.ifError(err)
                    broker.publish('p1', 'test message', function(err) {
                        assert.ifError(err)
                        setTimeout(done, 500)
                    })
                })
            })
        })
    })

    it('should tollerate repeated unsubscription', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: {
                s1: {
                    vhost: '/',
                    queue: 'q1',
                    options: {
                        noAck: true
                    }
                }
            }
        }, function(err, broker) {
            assert.ifError(err)

            broker.subscribe('s1', function(err, subscription) {
                assert.ifError(err)
                async.timesSeries(3, function(index, cb) {
                    subscription.cancel(cb)
                }, done)
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