var assert = require('assert')
var async = require('async')
var client = require('..')
var uuid = require('node-uuid').v4

describe('Client', function() {

    this.timeout(1000)
    this.slow(500)

    it('should publish a text message to an exchange', function(done) {

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
                        durable: false,
                        exclusive: true
                    }
                }
            },
            exchanges: {
                'bookings:events': {
                }
            },
            queues: {
                'booking_system:create': {
                }
            },
            bindings: [
                {
                    source: 'bookings:events',
                    destination: 'booking_system:create',
                    destinationType: 'queue',
                    routingKey: '#'
                }
            ]
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('bookings:events', 'booking.created', 'some message', function() {
                broker.channel.get(namespace + ':booking_system:create', { noAck: true }, function(err, message) {
                    assert.ifError(err)
                    assert.equal(message.content.toString(), 'some message')
                    done()
                })
            })
        })

    })

    it('should purge messages when specified', function(done) {

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
                        durable: false
                    }
                }
            },
            exchanges: {
                'bookings:events': {
                }
            },
            queues: {
                'booking_system:create': {
                }
            },
            bindings: [
                {
                    source: 'bookings:events',
                    destination: 'booking_system:create',
                    destinationType: 'queue',
                    routingKey: '#'
                }
            ]
        }, function(err, broker) {
            assert.ifError(err)
            broker.publish('bookings:events', 'booking.created', 'some message', function() {

                client.init({
                    namespace: namespace,
                    defaults: {
                        exchanges: {
                            options: {
                                durable: false
                            }
                        },
                        queues: {
                            purge: true,
                            options: {
                                durable: false
                            }
                        }
                    },
                    exchanges: {
                        'bookings:events': {
                        }
                    },
                    queues: {
                        'booking_system:create': {
                        }
                    },
                    bindings: [
                        {
                            source: 'bookings:events',
                            destination: 'booking_system:create',
                            destinationType: 'queue',
                            routingKey: '#'
                        }
                    ]
                }, function(err, broker) {
                    assert.ifError(err)
                    broker.channel.get(namespace + ':booking_system:create', { noAck: true }, function(err, message) {
                        assert.ifError(err)
                        assert(!message)
                        done()
                    })
                })
            })
        })
    })
})