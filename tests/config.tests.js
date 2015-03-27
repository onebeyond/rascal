var assert = require('assert')
var async = require('async')
var client = require('..')
var uuid = require('node-uuid').v4

describe('Client', function() {

    this.timeout(1000)
    this.slow(500)

    var broker

    afterEach(function(done) {
        broker.nuke(done)
    })

    it('should connect to broker using default url', function(done) {
        client.init(function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            assert(broker.connection)
            assert(broker.connection.createChannel)
            done()
        })
    })

    it('should connect to broker using specified url', function(done) {
        client.init({ connection: { url: 'amqp://localhost:5672' }}, function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            assert(broker.connection)
            assert(broker.connection.createChannel)
            done()
        })
    })

    it('should connect to broker using connection properties', function(done) {
        client.init({ connection: {
            protocol: 'amqp',
            hostname: 'localhost',
            user: 'guest',
            password: 'guest',
            port: 5672,
            vhost: '/',
        }}, function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            assert(broker.connection)
            assert(broker.connection.createChannel)
            done()
        })
    })

    it('should create a channel', function(done) {
        client.init(function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            assert(broker.channel)
            done()
        })
    })

    it('should create a confirm channel')

    it('should create queues by default', function(done) {

        var namespace = uuid()

        client.init({
            namespace: namespace,
            defaults: {
                queues: {
                    options: {
                        exclusive: true,
                        durable: false
                    }
                }
            },
            queues: {
                'booking_system:create': {
                },
                'booking_system:amend': {
                },
                'booking_system:cancel': {
                }
            }
        }, function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            async.series([
                broker.channel.checkQueue.bind(broker.channel, namespace + ':booking_system:create'),
                broker.channel.checkQueue.bind(broker.channel, namespace + ':booking_system:amend'),
                broker.channel.checkQueue.bind(broker.channel, namespace + ':booking_system:cancel')
            ], done)
        })
    })

    it.only('should not create queues when specified', function(done) {

        var namespace = uuid()

        client.init({
            namespace: namespace,
            defaults: {
                queues: {
                    assert: false,
                    options: {
                        exclusive: true,
                        durable: false
                    }
                }
            },
            queues: {
                'booking_system:create': {
                }
            }
        }, function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            broker.channel.checkQueue(namespace + ':booking_system:create', function(err) {
                assert(err)
                assert(/NOT_FOUND/.test(err.message))
                done()
            })
        })
    })

    it('should check queues when specified', function(done) {

        var namespace = uuid()

        client.init({
            namespace: namespace,
            defaults: {
                queues: {
                    assert: false,
                    check: true,
                    options: {
                        exclusive: true,
                        durable: false
                    }
                }
            },
            queues: {
                'booking_system:create': {
                }
            }
        }, function(err, broker) {
            stashBroker(broker)
            assert(err)
            assert(/NOT_FOUND/.test(err.message))
            done()
        })
    })

    it('should create exchanges by default', function(done) {

        var namespace = uuid()

        client.init({
            namespace: namespace,
            defaults: {
                exchanges: {
                    options: {
                        durable: false
                    }
                }
            },
            exchanges: {
                'booking:events': {
                },
                'booking:commands': {
                },
                'booking:errors': {
                }
            }
        }, function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            async.series([
                broker.channel.checkExchange.bind(broker.channel, namespace + ':booking:events'),
                broker.channel.checkExchange.bind(broker.channel, namespace + ':booking:commands'),
                broker.channel.checkExchange.bind(broker.channel, namespace + ':booking:errors')
            ], done)
        })
    })

    it('should not create exchanges when specified', function(done) {

        var namespace = uuid()

        client.init({
            namespace: namespace,
            defaults: {
                exchanges: {
                    assert: false,
                    options: {
                        durable: false
                    }
                }
            },
            exchanges: {
                'booking:events': {
                }
            }
        }, function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            broker.channel.checkExchange(namespace + ':booking:events', function(err) {
                assert(err)
                assert(/NOT_FOUND/.test(err.message))
                done()
            })
        })
    })

    it('should check exchange when specified', function(done) {

        var namespace = uuid()

        client.init({
            namespace: namespace,
            defaults: {
                exchanges: {
                    assert: false,
                    check: true,
                    options: {
                        durable: false
                    }
                }
            },
            exchanges: {
                'booking:events': {
                }
            }
        }, function(err, broker) {
            stashBroker(broker)
            assert(err)
            assert(/NOT_FOUND/.test(err.message))
            done()
        })
    })

    it('should bind queues to exchanges', function(done) {
        var namespace = uuid()

        client.init({
            namespace: namespace,
            defaults: {
                exchanges: {
                    options: {
                        durable: false
                    }
                },
                queues: {
                    options: {
                        exclusive: true,
                        durable: false
                    }
                }
            },
            exchanges: {
                'booking:events': {
                }
            },
            queues: {
                'booking_system:create': {
                }
            },
            bindings: [
                {
                    source: 'booking:events',
                    destination: 'booking_system:create',
                    destinationType: 'queue',
                    routingKey: '#'
                }
            ]
        }, function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            done()
        })
    })

    function stashBroker(_broker) {
        broker = _broker
    }
})