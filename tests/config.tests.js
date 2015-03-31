var debug = require('debug')('amqp-nice:config:tests')
var assert = require('assert')
var _ = require('lodash')
var configure = require('../lib/config/configure')

describe('Configuration', function() {

    describe('Vhosts', function() {

        describe('Connection', function() {

            it('should configure the connection from an object', function() {
                configure({
                    vhosts: {
                        v1: {
                            connection: {
                                slashes: true,
                                protocol: 'protocol',
                                hostname: 'hostname',
                                port: 9000,
                                vhost: 'vhost',
                                user: 'user',
                                password: 'password',
                                options: {
                                    heartbeat: 10,
                                    channelMax: 100
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.connection.url, 'protocol://user:password@hostname:9000/vhost?heartbeat=10&channelMax=100')
                })
            })

            it('should ignore other connection properties when a url is specified', function() {
                configure({
                    vhosts: {
                        v1: {
                            connection: {
                                url: 'foo',
                                slashes: true,
                                protocol: 'protocol',
                                hostname: 'hostname',
                                port: 9000,
                                vhost: 'vhost',
                                user: 'user',
                                password: 'password',
                                options: {
                                    heartbeat: 10,
                                    channelMax: 100
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.connection.url, 'foo')
                })
            })

            it('should decorate the connection config with a loggable url (a)', function() {
                configure({
                    vhosts: {
                        v1: {
                            connection: {
                                slashes: true,
                                protocol: 'protocol',
                                hostname: 'hostname',
                                port: 9000,
                                vhost: 'vhost',
                                user: 'user',
                                password: 'password',
                                options: {
                                    heartbeat: 10,
                                    channelMax: 100
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.connection.loggableUrl, 'protocol://user:***@hostname:9000/vhost?heartbeat=10&channelMax=100')
                })
            })

            it('should decorate the connection config with a loggable url (b)', function() {
                configure({
                    vhosts: {
                        v1: {
                            connection: {
                                url: 'protocol://user:password@hostname:9000/vhost?heartbeat=10&channelMax=100'
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.connection.loggableUrl, 'protocol://user:***@hostname:9000/vhost?heartbeat=10&channelMax=100')
                })
            })
        })

        describe('Exchanges', function() {

            it('should configure exchanges', function() {
                configure({
                    vhosts: {
                        v1: {
                            exchanges: {
                                e1: {
                                    assert: false,
                                    type: 'direct',
                                    options: {
                                        durable: false
                                    }
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.exchanges.e1.assert, false)
                    assert.equal(config.vhosts.v1.exchanges.e1.type, 'direct')
                    assert.equal(config.vhosts.v1.exchanges.e1.options.durable, false)
                })
            })

            it('should inflate exchanges with empty structure', function() {
                configure({
                    vhosts: {
                        v1: {
                            exchanges: {
                                e1: {
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert(_.isObject(config.vhosts.v1.exchanges.e1.options))
                })
            })

            it('should decorate exchanges with name and fully qualified name', function() {
                configure({
                    vhosts: {
                        v1: {
                            exchanges: {
                                e1: {
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.exchanges.e1.name, 'e1')
                    assert.equal(config.vhosts.v1.exchanges.e1.fullyQualifiedName, 'e1')
                })
            })

            it('should prefix fully qualified name with specified namespace', function() {
                configure({
                    vhosts: {
                        v1: {
                            namespace: 'foo',
                            exchanges: {
                                e1: {
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.exchanges.e1.name, 'e1')
                    assert.equal(config.vhosts.v1.exchanges.e1.fullyQualifiedName, 'foo:e1')
                })
            })
        })

        describe('Queues', function() {

            it('should configure queues', function() {
                configure({
                    vhosts: {
                        v1: {
                            queues: {
                                q1: {
                                    assert: false,
                                    type: 'direct',
                                    options: {
                                        durable: false
                                    }
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.queues.q1.assert, false)
                    assert.equal(config.vhosts.v1.queues.q1.type, 'direct')
                    assert.equal(config.vhosts.v1.queues.q1.options.durable, false)
                })
            })

            it('should inflate queues with empty structure', function() {
                configure({
                    vhosts: {
                        v1: {
                            queues: {
                                q1: {
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert(_.isObject(config.vhosts.v1.queues.q1.options))
                })
            })

            it('should decorate queues with name and fully qualified name', function() {
                configure({
                    vhosts: {
                        v1: {
                            queues: {
                                q1: {
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.queues.q1.name, 'q1')
                    assert.equal(config.vhosts.v1.queues.q1.fullyQualifiedName, 'q1')
                })
            })

            it('should prefix fully qualified name with specified namespace', function() {
                configure({
                    vhosts: {
                        v1: {
                            namespace: 'foo',
                            queues: {
                                q1: {
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.queues.q1.name, 'q1')
                    assert.equal(config.vhosts.v1.queues.q1.fullyQualifiedName, 'foo:q1')
                })
            })
        })

        describe('Bindings', function() {

            it('should configure bindings', function() {
                configure({
                    vhosts: {
                        v1: {
                            bindings: {
                                b1: {
                                    source: 'e1',
                                    destination: 'q1',
                                    routingKey: '#'
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.bindings.b1.source, 'e1')
                    assert.equal(config.vhosts.v1.bindings.b1.destination, 'q1')
                    assert.equal(config.vhosts.v1.bindings.b1.routingKey, '#')
                })
            })

            it('should inflate bindings with empty structure', function() {
                configure({
                    vhosts: {
                        v1: {
                            bindings: {
                                b1: {
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert(_.isObject(config.vhosts.v1.bindings.b1.options))
                })
            })

            it('should decorate bindings with name', function() {
                configure({
                    vhosts: {
                        v1: {
                            bindings: {
                                b1: {
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.bindings.b1.name, 'b1')
                })
            })
        })
    })

    describe('Publications', function() {

        it('should configure exchange publications', function() {

            configure({
                vhosts: {
                    v1: {
                    }
                },
                publications: {
                    p1: {
                        vhost: 'v1',
                        exchange: 'e1',
                        routingKey: 'r1',
                        options: {
                            persistent: true
                        }
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.equal(config.publications.p1.vhost, 'v1')
                assert.equal(config.publications.p1.exchange, 'e1')
                assert.equal(config.publications.p1.routingKey, 'r1')
                assert.equal(config.publications.p1.options.persistent, true)
            })
        })

        it('should configure queue publications', function() {

            configure({
                vhosts: {
                    v1: {
                    }
                },
                publications: {
                    p1: {
                        vhost: 'v1',
                        queue: 'q1',
                        options: {
                            persistent: true
                        }
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.equal(config.publications.p1.vhost, 'v1')
                assert.equal(config.publications.p1.queue, 'q1')
                assert.equal(config.publications.p1.options.persistent, true)
            })
        })

        it('should inflate publications with empty structure', function() {

            configure({
                vhosts: {
                    v1: {
                    }
                },
                publications: {
                    p1: {
                        vhost: 'v1'
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert(_.isObject(config.publications.p1.options))
            })
        })

        it('should decorate publications with name and destination', function() {

            configure({
                vhosts: {
                    v1: {
                    }
                },
                publications: {
                    p1: {
                        vhost: 'v1',
                        exchange: 'e1'
                    },
                    p2: {
                        vhost: 'v1',
                        queue: 'q1'
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.equal(config.publications.p1.name, 'p1')
                assert.equal(config.publications.p1.destination, 'e1')
                assert.equal(config.publications.p2.name, 'p2')
                assert.equal(config.publications.p2.destination, 'q1')
            })
        })

        it('should prefix destinations with the specified namespace', function() {

            configure({
                vhosts: {
                    v1: {
                        namespace: 'foo'
                    }
                },
                publications: {
                    p1: {
                        vhost: 'v1',
                        exchange: 'e1'
                    },
                    p2: {
                        vhost: 'v1',
                        queue: 'q1'
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.equal(config.publications.p1.name, 'p1')
                assert.equal(config.publications.p1.destination, 'foo:e1')
                assert.equal(config.publications.p2.name, 'p2')
                assert.equal(config.publications.p2.destination, 'foo:q1')
            })
        })
    })

    describe('Subscriptions', function() {

        it('should configure queue subscriptions', function() {

            configure({
                vhosts: {
                    v1: {
                    }
                },
                subscriptions: {
                    s1: {
                        vhost: 'v1',
                        queue: 'q1',
                        confirm: true,
                        retry: {
                            delay: 1000
                        }
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.equal(config.subscriptions.s1.vhost, 'v1')
                assert.equal(config.subscriptions.s1.queue, 'q1')
                assert.equal(config.subscriptions.s1.confirm, true)
                assert.equal(config.subscriptions.s1.retry.delay, 1000)
            })
        })

        it('should inflate subscriptions with empty structure', function() {

            configure({
                vhosts: {
                    v1: {
                    }
                },
                subscriptions: {
                    s1: {
                        vhost: 'v1'
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert(_.isObject(config.subscriptions.s1.options))
            })
        })

        it('should decorate subscriptions with name and source', function() {

            configure({
                vhosts: {
                    v1: {
                    }
                },
                subscriptions: {
                    s1: {
                        vhost: 'v1',
                        queue: 'q1'
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.equal(config.subscriptions.s1.name, 's1')
                assert.equal(config.subscriptions.s1.source, 'q1')
            })
        })

        it('should prefix sources with the specified namespace', function() {

            configure({
                vhosts: {
                    v1: {
                        namespace: 'foo'
                    }
                },
                subscriptions: {
                    s1: {
                        vhost: 'v1',
                        queue: 'q1'
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.equal(config.subscriptions.s1.name, 's1')
                assert.equal(config.subscriptions.s1.source, 'foo:q1')
            })
        })
    })
})
