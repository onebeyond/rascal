var assert = require('assert')
var _ = require('lodash').runInContext().mixin({ 'defaultsDeep': require('merge-defaults') });
var testConfig = require('../lib/config/tests')
var uuid = require('node-uuid').v4
var Broker = require('..').Broker

describe('Shovel', function() {

    this.slow(undefined)

    var broker
    var namespace
    var config

    beforeEach(function(done) {

        namespace = uuid()
        config = {
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
                            bindingKey: 'bar'
                        }
                    }
                }
            },
            publications: {
                p1: {
                    exchange: 'e1',
                    routingKey: 'foo'
                },
                p2: {
                    exchange: 'e2',
                    routingKey: 'bar'
                }
            },
            subscriptions: {
                s1: {
                    queue: 'q1'
                },
                s2: {
                    queue: 'q2',
                    options: {
                        noAck: true
                    }
                }
            },
            shovels: {
                x1: {
                    subscription: 's1',
                    publication: 'p2'
                }
            }
        }
        done()
    })

    afterEach(function(done) {
        if (!broker) return done()
        broker.nuke(done)
    })

    it('should transfer message from subscriber to publication', function(done) {
        createBroker(config, function(err, broker) {
            assert.ifError(err)
            broker.publish('p1', 'Test Message', assert.ifError)
            broker.subscribe('s2', function(err, subscription) {
                assert.ifError(err)
                subscription.on('message', function(message, content) {
                    done()
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