var assert = require('assert')
var _ = require('lodash').runInContext()
var async = require('async')
var amqplib = require('amqplib/callback_api')
var testConfig = require('../lib/config/tests')
var uuid = require('uuid').v4
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

    it('should consume to text/plain messages', function(done) {

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

    it('should consume to text/other messages', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', {
                options: {
                    contentType: 'text/csv'
                }
            }, function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert(message)
                        assert.equal(message.properties.contentType, 'text/csv')
                        assert.equal(content, 'test message')
                        done()
                    })
                })
            })
        })
    })

    it('should consume to whatever/whatever messages', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: subscriptions
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', {
                options: {
                    contentType: 'x-foo-bar/blah'
                }
            }, function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert(message)
                        assert.equal(message.properties.contentType, 'x-foo-bar/blah')
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

    it('should consume to invalid messages when no listener is bound', function(done) {
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
                    subscription.on('error', function() {
                        broker.shutdown(function(err) {
                            assert.ifError(err)
                            amqputils.assertMessageAbsent('q1', namespace, done)
                        })
                    })
                })
            })
        })
    })

    it('should not consume an invalid messages messages when a listener is bound to invalid_content', function(done) {
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
                    subscription.on('invalid_content', function(err, message, ackOrNack) {
                        assert(err)
                        broker.shutdown(function(err) {
                            assert.ifError(err)
                            amqputils.assertMessage('q1', namespace, 'not json', done)
                        })
                    })
                })
            })
        })
    })

    it('should not consume an invalid messages messages when a listener is bound to invalid_message', function(done) {
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
                        assert(err)
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
                    subscription.on('invalid_content', function(err, message, ackOrNack) {
                        assert(err)
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
                    subscription.on('invalid_content', function(err, message, ackOrNack) {
                        assert(err)
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

    it('should count redeliveries when counter type is specified', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: {
                s1: {
                    vhost: '/',
                    queue: 'q1',
                    redeliveries: {
                        counter: 'inMemory'
                    }
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)

                var errors = 0
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        if (message.properties.headers.rascal.redeliveries >= 10) return subscription.cancel(done)
                        throw new Error('oh no')
                    }).on('error', function() {
                        if (errors++ > 10) done(new Error('Redeliveries were not counted'))
                    })
                })
            })
        })
    })

    it('should notify when redeliveries exceeds', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: {
                s1: {
                    vhost: '/',
                    queue: 'q1',
                    redeliveries: {
                        limit: 5,
                        counter: 'inMemory'
                    }
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)

                var errors = 0
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        if (message.properties.headers.rascal.redeliveries >= 10) return subscription.cancel(done)
                        throw new Error('oh no')
                    }).on('redeliveries_exceeded', function(err, message, ackOrNack) {
                        assert(err)
                        broker.shutdown(function(err) {
                            assert.ifError(err)
                            amqputils.assertMessage('q1', namespace, 'test message', done)
                        })
                    }).on('error', function() {
                        if (errors++ > 5) done(new Error('Redeliveries were exceeded'))
                    })
                })
            })
        })
    })


    it('should not notify when redeliveries limit is 0', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: {
                s1: {
                    vhost: '/',
                    queue: 'q1',
                    redeliveries: {
                        limit: 0,
                        counter: 'inMemory'
                    }
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)

                var errors = 0
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        if (message.properties.headers.rascal.redeliveries >= 10) return subscription.cancel(done)
                        throw new Error('oh no')
                    }).on('redeliveries_exceeded', function(err, message, ackOrNack) {
                        assert.ifError(err, 'Redeliveries were exceeded')
                    }).on('error', function() {
                        if (errors++ > 5) done()
                    })
                })
            })
        })
    })


    it('should not notify when counter type is not specified', function(done) {

        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: {
                s1: {
                    vhost: '/',
                    queue: 'q1',
                    redeliveries: {
                        limit: 5,
                        counter: 'inMemory'
                    }
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)

                var errors = 0
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)
                    subscription.on('message', function(message, content, ackOrNack) {
                        if (message.properties.headers.rascal.redeliveries >= 10) return subscription.cancel(done)
                        throw new Error('oh no')
                    }).on('redeliveries_exceeded', function(err, message, ackOrNack) {
                        assert.ifError(err, 'Redeliveries were exceeded')
                    }).on('error', function() {
                        if (errors++ > 5) done()
                    })
                })
            })
        })
    })

    it('should consume a poison messages when no listener is bound', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: {
                s1: {
                    vhost: '/',
                    queue: 'q1',
                    redeliveries: {
                        limit: 5,
                        counter: 'inMemory'
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
                        throw new Error('oh no')
                    }).on('error', function(err) {
                        if (!/Message .* has exceeded 5 redeliveries/.test(err.message)) return
                        broker.shutdown(function(err) {
                            assert.ifError(err)
                            amqputils.assertMessageAbsent('q1', namespace, done)
                        })
                    })
                })
            })
        })
    })


    it('should consume a poision message when a listener acks it', function(done) {
        createBroker({
            vhosts: vhosts,
            publications: publications,
            subscriptions: {
                s1: {
                    vhost: '/',
                    queue: 'q1',
                    redeliveries: {
                        limit: 5,
                        counter: 'inMemory'
                    }
                }
            }
        }, function(err, broker) {
            assert.ifError(err)
            assert.ifError(err)
            broker.publish('p1', 'test message', function(err) {
                assert.ifError(err)
                broker.subscribe('s1', function(err, subscription) {
                    assert.ifError(err)

                    var errors = 0
                    subscription.on('message', function(message, content, ackOrNack) {
                        throw new Error('oh no')
                    }).on('redeliveries_exceeded', function(err, message, ackOrNack) {
                        assert(err)
                        ackOrNack(function() {
                            setTimeout(function() {
                                broker.shutdown(function(err) {
                                    assert.ifError(err)
                                    amqputils.assertMessageAbsent('q1', namespace, done)
                                })
                            })
                        })
                    }).on('error', function() {
                        if (errors++ > 5) done(new Error('Redeliveries were exceeded'))
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
                        if (messages[message.properties.messageId] < 10) return ackOrNack({ message: 'republish me', code: 'red' }, { strategy: 'republish' })
                        assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].republished, 9)
                        assert.equal(message.properties.headers.rascal.error.message, 'republish me')
                        assert.equal(message.properties.headers.rascal.error.code, 'red')
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
                        assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].republished, 9)
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
                            assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].republished, 1)
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

    it('should immediately nack republished messages when requested', function(done) {
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
                            destination: 'q1'
                        },
                        b2: {
                            source: 'e2',
                            destination: 'q2'
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
                    var count = 0
                    subscription.on('message', function(message, content, ackOrNack) {
                        assert.equal(++count, 1)
                        assert.ok(message)
                        ackOrNack(new Error('immediate nack'), {
                            strategy: 'republish',
                            immediateNack: true
                        })
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
                    ackOrNack({ message: 'forward me', code: 'red' }, { strategy: 'forward', publication: 'p2' })
                })
            })

            broker.subscribe('s2', function(err, subscription) {
                assert.ifError(err)
                subscription.on('message', function(message, content, ackOrNack) {
                    assert.ok(message)
                    ackOrNack()
                    assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1)
                    assert.equal(message.properties.headers.CC.length, 1)
                    assert.equal(message.properties.headers.CC[0], broker.qualify('/', 'q1') + '.bar')
                    assert.equal(message.properties.headers.rascal.error.message, 'forward me')
                    assert.equal(message.properties.headers.rascal.error.code, 'red')
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
                    assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1)
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
                   assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1)
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
                assert.ifError(err)
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
                    assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1)
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

    it('should error on unknown recovery strategy', function(done) {

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
                        ackOrNack(new Error('retry'), [
                            { strategy: 'republish', attempts: 5 },
                            { strategy: 'ack' }
                        ], function() {
                            messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1
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

    it('should not rollback message when shutting down broker after ack', function(done) {
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
                        ackOrNack(null, function() {
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

    it('should not rollback message when shutting down broker after ack', function(done) {
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
                        ackOrNack(new Error('Oh Noes'), [
                            { strategy: 'ack' }
                        ], function() {
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

    it('should nack messages when all recovery strategies have been attempted', function(done) {
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
                        ackOrNack(new Error('retry'), [], function() {
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
                        if (messages === 5) {
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


    it('should not warn about emitter leaks', function(done) {

        var config = {
            vhosts: vhosts,
            publications: publications,
            subscriptions: {}
        }

        _.times(11, function(i) {
            config.subscriptions['s' + i] = {
                vhost: '/',
                queue: 'q1',
                options: {
                    noAck: true
                }
            }
        })

        createBroker(config, function(err, broker) {
            assert.ifError(err)

            _.times(11, function(i) {
                broker.subscribe('s' + i, function(err, subscription) {
                    assert.ifError(err)
                    if (i === 10) done()
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
