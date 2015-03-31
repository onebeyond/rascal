var debug = require('debug')('amqp-nice:config:tests')
var assert = require('assert')
var async = require('async')
var client = require('..')
var uuid = require('node-uuid').v4

describe('Client', function() {

    this.timeout(1000)
    this.slow(500)

    var broker
    var namespace

    beforeEach(function() {
        namespace = uuid()
    })

    afterEach(function(done) {
        broker.nuke(done)
    })

    it('should initialise a broker using default url', function(done) {
        client.init(function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            assert.equal(broker.config.connection.url, 'amqp://guest:guest@localhost:5672?heartbeat=5')
            done()
        })
    })

    it('should initialise a broker using specified url', function(done) {
        client.init({ connection: { url: 'amqp://localhost:5672' }}, function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            assert.equal(broker.config.connection.url, 'amqp://localhost:5672')
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
            assert.equal(broker.config.connection.url, 'amqp://guest:guest@localhost:5672?heartbeat=5')
            done()
        })
    })

    it('should create queues by default', function(done) {

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
                'q1': {},
                'q2': {},
                'q3': {}
            }
        }, function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            async.each(['q1', 'q2', 'q3'], assertQueuePresent, done)
        })
    })

    it('should not create queues when specified', function(done) {

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
                'q1': {}
            }
        }, function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            assertQueueAbsent('q1', done)
        })
    })

    it('should check queues when specified', function(done) {

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
                'q1': {}
            }
        }, function(err, broker) {
            stashBroker(broker)
            assert(err)
            assert(/NOT_FOUND/.test(err.message))
            done()
        })
    })

    it('should create exchanges by default', function(done) {

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
                'q1': {},
                'q2': {},
                'q3': {}
            }
        }, function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            async.each(['q1', 'q2', 'q3'], assertExchangePresent, done)
        })
    })

    it('should not create exchanges when specified', function(done) {

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
                'q1': {}
            }
        }, function(err, broker) {
            stashBroker(broker)
            assert.ifError(err)
            assertExchangeAbsent('q1', done)
        })
    })

    it('should check exchange when specified', function(done) {

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
                'q1': {}
            }
        }, function(err, broker) {
            stashBroker(broker)
            assert(err)
            assert(/NOT_FOUND/.test(err.message))
            done()
        })
    })

    it('should purge messages when specified')


    function stashBroker(_broker) {
        broker = _broker
    }

    function assertQueuePresent(name, next) {
        broker.connection.createChannel(function(err, channel) {
            assert.ifError(err)
            channel.checkQueue(namespace + ':' + name, function(err) {
                assert.ifError(err)
                next()
            })
        })
    }

    function assertQueueAbsent(name, next) {
        broker.connection.createChannel(function(err, channel) {
            assert.ifError(err)
            channel.checkQueue(name, function(err) {
                assert(err)
                assert(/NOT_FOUND/.test(err.message))
                next()
            }).on('error', function(err) {
                debug(err.message)
            })
        })
    }

    function assertExchangePresent(name, next) {
        broker.connection.createChannel(function(err, channel) {
            assert.ifError(err)
            channel.checkExchange(namespace + ':' + name, function(err) {
                assert.ifError(err)
                next()
            })
        })
    }

    function assertExchangeAbsent(name, next) {
        broker.connection.createChannel(function(err, channel) {
            assert.ifError(err)
            channel.checkExchange(name, function(err) {
                assert(err)
                assert(/NOT_FOUND/.test(err.message))
                next()
            }).on('error', function(err) {
                debug(err.message)
            })
        })
    }
})