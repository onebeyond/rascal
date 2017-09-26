var assert = require('assert')
var _ = require('lodash').mixin({ 'defaultsDeep': require('merge-defaults') })
var testConfig = require('../lib/config/tests')
var uuid = require('uuid').v4
var Broker = require('..').Broker


describe('Broker', function () {

    this.timeout(2000)
    this.slow(1000)

    var broker
    var namespace
    var vhosts
    var publications
    var subscriptions

    beforeEach(function (done) {

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
                subscriptions: {
                    s1: {
                        queue: 'q1'
                    }
                },
                publications: {
                    p1: {
                        exchange: 'e1'
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

        done()
    })

    afterEach(function (done) {
        if (broker) return broker.nuke(done)
        done()
    })

    it('should provide fully qualified name', function (done) {
        var config = _.defaultsDeep({ vhosts: vhosts }, testConfig)
        createBroker(config, function (err, broker) {
            assert.ifError(err)
            assert.equal(namespace + ':q1', broker.getFullyQualifiedName('/', 'q1'))
            done()
        })
    })

    it('should not modify configuration', function (done) {
        var config = _.defaultsDeep({ vhosts: vhosts }, testConfig)
        var json = JSON.stringify(config, null, 2)
        createBroker(config, function (err, broker) {
            assert.ifError(err)
            assert.equal(json, JSON.stringify(config, null, 2))
            done()
        })
    })

    it('should nuke', function (done) {
        var config = _.defaultsDeep({ vhosts: vhosts }, testConfig)
        createBroker(config, function (err, broker) {
            assert.ifError(err)
            broker.nuke(function (err) {
                assert.ifError(err)
                done()
            })
        })
    })

    it('should cancel subscriptions', function (done) {
        var config = _.defaultsDeep({
            vhosts: vhosts, publications: publications,
            subscriptions: subscriptions
        }, testConfig)

        createBroker(config, function (err, broker) {
            assert.ifError(err)

            broker.subscribe('s1', function (err, subscription) {
                assert.ifError(err)

                subscription.on('message', function (message, content, ackOrNack) {
                    subscription.cancel(function (err) {
                        done(err)
                    });
                    assert(false, 'No message should have been received')
                })

                broker.unsubscribeAll(function (err) {
                    assert.ifError(err)

                    broker.publish('p1', 'test message', function (err) {
                        assert.ifError(err)
                        setTimeout(done, 500)
                    })
                })
            })
        })
    })


    function createBroker(config, next) {
        Broker.create(config, function (err, _broker) {
            broker = _broker
            next(err, broker)
        })
    }
})