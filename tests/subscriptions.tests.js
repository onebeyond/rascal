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
                    },
                    e2: {
                        assert: true
                    },
                    xx: {
                        assert: true
                    }
                },
                queues: {
                    q1: {
                        assert: true
                    },
                    q2: {
                        assert: true
                    },
                    q3: {
                        assert: true
                    }
                },
                bindings: {
                    b1: {
                        source: 'e1',
                        destination: 'q1',
                        bindingKey: 'foo'
                    },
                    b2: {
                        source: 'e2',
                        destination: 'q2',
                        bindingKey: 'bar'
                    },
                    b3: {
                        source: 'e1',
                        destination: 'q3',
                        bindingKey: 'baz'
                    }
                }
            }
        }

        publications = {
            p1: {
                vhost: '/',
                exchange: 'e1',
                routingKey: 'foo'
            },
            p2: {
                vhost: '/',
                exchange: 'e2',
                routingKey: 'bar'
            },
            p3: {
                vhost: '/',
                exchange: 'xx'
            }
        }

        subscriptions = {
            s1: {
                vhost: '/',
                queue: 'q1'
            },
            s2: {
                vhost: '/',
                queue: 'q2'
            },
            s3: {
                vhost: '/',
                queue: 'q3'
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

    it('should consume to invalid messages messages when no listener is bound', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            amqputils.publishMessage('e1', namespace, new Buffer('not json'), { routingKey: 'foo', contentType: 'application/json' }, function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('error', function(err) {
                        broker.shutdown(function(err) {
                            assert.ifError(err)
                            amqputils.assertMessageAbsent('q1', namespace, done)
                        })
                    })
                })
            })
        })
    })

    it('should not consume an invalid messages messages when a listener is bound', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            amqputils.publishMessage('e1', namespace, new Buffer('not json'), { routingKey: 'foo', contentType: 'application/json' }, function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('invalid_message', function(err, message, ackOrNack) {
                        broker.shutdown(function(err) {
                            assert.ifError(err)
                            amqputils.assertMessage('q1', namespace, 'not json', done)
                        })
                    })
                })
            })
        })
    })

    it('should consume an invalid message when a listener acks it', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            amqputils.publishMessage('e1', namespace, new Buffer('not json'), { routingKey: 'foo', contentType: 'application/json' }, function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('invalid_message', function(err, message, ackOrNack) {
                        ackOrNack(function() {
                            setTimeout(function() {
                                broker.shutdown(function(err) {
                                    assert.ifError(err)
                                    amqputils.assertMessageAbsent('q1', namespace, done)
                                })
                            })
                        })
                    })
                })
            })
        })
    })

    it('should consume an invalid message when a listener nacks it', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            amqputils.publishMessage('e1', namespace, new Buffer('not json'), { routingKey: 'foo', contentType: 'application/json' }, function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('invalid_message', function(err, message, ackOrNack) {
                        ackOrNack(err, function() {
                            setTimeout(function() {
                                broker.shutdown(function(err) {
                                    assert.ifError(err)
                                    amqputils.assertMessageAbsent('q1', namespace, done)
                                })
                            })
                        })
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

    it('should reject messages when requested', function(done) {
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
                            assert: true,
                            options: {
                                arguments: {
                                    'x-dead-letter-exchange': 'e2'
                                }
                            }
                        },
                        q2: {
                            assert: true
                        }
                    },
                    bindings: {
                        b1: {
                            source: 'e1',
                            destination: 'q1',
                            bindingKey: 'foo'
                        },
                        b2: {
                            source: 'e2',
                            destination: 'q2',
                            bindingKey: 'foo'
                        }
                    }
                }
            },
            publications: _.pick(publications, 'p1'),
            subscriptions: {
                s1: {
                    vhost: '/',
                    queue: 'q1'
                },
                s2: {
                    vhost: '/',
                    queue: 'q2'
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
                        ackOrNack(new Error('reject'))
                    })
                })

                broker.subscribe('s2', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert.ok(message)
                        done()
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
                        if (messages[message.properties.messageId] < 10) return ackOrNack(new Error('retry'), {
                            strategy: 'nack',
                            requeue: true
                        })
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
                        if (numberOfMessages < 10) return ackOrNack(new Error('retry'), {
                            strategy: 'nack',
                            defer: 100,
                            requeue: true
                        })
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
                        if (messages[message.properties.messageId] < 10) return ackOrNack(new Error('republish me'), { strategy: 'republish' })
                        assert.equal(message.properties.headers.rascal[broker.qualify('/', 'q1')].republished, 9)
                        assert.equal(message.properties.headers.rascal.error.message, 'republish me')
                        done()
                    })
                })
            })
        })
    })

    it('should truncate error messages when republishing', function(done) {

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
                        if (messages[message.properties.messageId] < 10) return ackOrNack(new Error(_.pad('x', 10000, 'x')), { strategy: 'republish' })
                        assert.equal(message.properties.headers.rascal[broker.qualify('/', 'q1')].republished, 9)
                        assert.equal(message.properties.headers.rascal.error.message.length, 1024)
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
                            if (messages[message.properties.messageId] < 2) return ackOrNack(new Error('republish'), { strategy: 'republish' })
                            assert.equal(message.properties.headers.rascal[broker.qualify('/', 'q1')].republished, 1)
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
                    ackOrNack(new Error('republish'), { strategy: 'republish', attempts: 5 })
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
                        if (numberOfMessages < 10) return ackOrNack(new Error('republish'), { strategy: 'republish', defer: 100 })
                        var stopTime = new Date().getTime()
                        assert.ok((stopTime - startTime) >= 900, 'Republish was not deferred')
                        done()
                    })
                })
            })
        })
    })

    it('should forward messages to publication when requested', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', assert.ifError)

            broker.subscribe('s1', function(err, subscription) {
                assert.ifError(err)
                subscription.on('message', function(message, content, ackOrNack) {
                    assert.ok(message)
                    ackOrNack(new Error('forward me'), { strategy: 'forward', publication: 'p2' })
                })
            })

            broker.subscribe('s2', function(err, subscription) {
                assert.ifError(err)
                subscription.on('message', function(message, content, ackOrNack) {
                    assert.ok(message)
                    ackOrNack()
                    assert.equal(message.properties.headers.rascal[broker.qualify('/', 'q1')].forwarded, 1)
                    assert.equal(message.properties.headers.rascal.error.message, 'forward me')
                    done()
                })
            })
        })
    })

    it('should truncate error messages when forwarding', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', assert.ifError)

            broker.subscribe('s1', function(err, subscription) {
                assert.ifError(err)
                subscription.on('message', function(message, content, ackOrNack) {
                    assert.ok(message)
                    ackOrNack(new Error(_.pad('x', 10000, 'x')), { strategy: 'forward', publication: 'p2' })
                })
            })

            broker.subscribe('s2', function(err, subscription) {
                assert.ifError(err)
                subscription.on('message', function(message, content, ackOrNack) {
                    assert.ok(message)
                    ackOrNack()
                    assert.equal(message.properties.headers.rascal[broker.qualify('/', 'q1')].forwarded, 1)
                    assert.equal(message.properties.headers.rascal.error.message.length, 1024)
                    done()
                })
            })
        })
    })

    it('should override routing key when forward messages', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', assert.ifError)

            broker.subscribe('s1', function(err, subscription) {
                assert.ifError(err)
                subscription.on('message', function(message, content, ackOrNack) {
                    assert.ok(message)
                    ackOrNack(new Error('forward'), { strategy: 'forward', publication: 'p1', options: { routingKey: 'baz' }} )
                })
            })

            broker.subscribe('s3', function(err, subscription) {
                assert.ifError(err)
                subscription.on('message', function(message, content, ackOrNack) {
                    assert.ok(message)
                    ackOrNack()
                   assert.equal(message.properties.headers.rascal[broker.qualify('/', 'q1')].forwarded, 1)
                    done()
                })
            })
        })
    })

    it('should maintain original fields, properties and headers when forwarded', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)

            var messageId

            broker.publish('p1', 'test message', { options: { headers: { foo: 'bar' } } }, function(err, publication) {
                publication.on('success', function(_messageId) {
                    messageId = _messageId
                })
            })

            broker.subscribe('s1', function(err, subscription) {
                assert.ifError(err)
                subscription.on('message', function(message, content, ackOrNack) {
                    assert.ok(message)
                    ackOrNack(new Error('forward'), { strategy: 'forward', publication: 'p2' })
                })
            })

            broker.subscribe('s2', function(err, subscription) {
                assert.ifError(err)
                subscription.on('message', function(message, content, ackOrNack) {
                    assert.ok(message)
                    ackOrNack()
                    assert.equal(message.properties.headers.rascal[broker.qualify('/', 'q1')].forwarded, 1)
                    assert.equal(message.properties.headers.foo, 'bar')
                    assert.equal(message.properties.messageId, messageId)
                    assert.equal(message.fields.routingKey, 'foo')
                    done()
                })
            })
        })
    })

    it('should cap forwards when requested', function(done) {

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
                    assert.ok(message)
                    count++
                    ackOrNack(new Error('forward'), { strategy: 'forward', publication: 'p1', attempts: 5 })
                })
            })

            setTimeout(function() {
                assert.equal(count, 6)
                done()
            }, 500)

        })
    })

    it('should error when forwarding messages to /dev/null', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err, publication) {
                assert.ifError(err)
                publication.on('success', function(messageId) {
                    broker.subscribe('s1', function(err, subscription) {
                        assert.ifError(err)
                        subscription.on('message', function(message, content, ackOrNack) {
                            assert.ok(message)
                            ackOrNack(new Error('forward'), { strategy: 'forward', publication: 'p3' })
                        }).on('error', function(err) {
                            assert.ok(err)
                            assert.equal('Message: ' + messageId + ' was forwared to publication: p3, but was returned', err.message)
                            done()
                        })
                    })
                })
            })
        })
    })

    it('should error unknown recovery strategy', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err, publication) {
                assert.ifError(err)
                publication.on('success', function(messageId) {
                    broker.subscribe('s1', function(err, subscription) {
                        assert.ifError(err)
                        subscription.on('message', function(message, content, ackOrNack) {
                            assert.ok(message)
                            ackOrNack(new Error('unknown'), { strategy: 'foo' })
                        }).on('error', function(err) {
                            assert.ok(err)
                            assert.equal('Error recovering message: ' + messageId + '. No such strategy: foo.', err.message)
                            done()
                        })
                    })
                })
            })
        })
    })

    it('should chain recovery strategies', function(done) {
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
                        ackOrNack(new Error('retry'), [
                            { strategy: 'republish', attempts: 5 },
                            { strategy: 'ack' }
                        ], function() {
                            if (messages[message.properties.messageId] < 6) return
                            setTimeout(function() {
                                assert.equal(messages[message.properties.messageId], 6)
                                done()
                            }, 500)
                        })
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
            publications: _.pick(publications, 'p1'),
            subscriptions: _.pick(subscriptions, 's1')
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