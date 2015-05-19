var assert = require('assert')
var format = require('util').format
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

            it('should decorate the connection config a vhost if not explicitly specified', function() {
                configure({
                    vhosts: {
                        v1: {
                            connection: {
                                slashes: true,
                                protocol: 'protocol',
                                hostname: 'hostname',
                                port: 9000,
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
                    assert.equal(config.vhosts.v1.connection.loggableUrl, 'protocol://user:***@hostname:9000/v1?heartbeat=10&channelMax=100')
                })
            })

            it('should set the pathname to empty string if the vhost is /', function() {
                configure({
                    vhosts: {
                        '/': {
                            connection: {
                                slashes: true,
                                protocol: 'protocol',
                                hostname: 'hostname',
                                port: 9000,
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
                    assert.equal(config.vhosts['/'].connection.loggableUrl, 'protocol://user:***@hostname:9000?heartbeat=10&channelMax=100')
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

            it('should generate a namespace when specified', function() {
                configure({
                    vhosts: {
                        v1: {
                            namespace: true
                        },
                        v2: {
                            namespace: true
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)

                    assert.ok(/\w+-\w+-\w+-\w+-\w+/.test(config.vhosts.v1.namespace), format('%s failed to match expected pattern', config.vhosts.v1.namespace))
                    assert.ok(/\w+-\w+-\w+-\w+-\w+/.test(config.vhosts.v2.namespace), format('%s failed to match expected pattern', config.vhosts.v1.namespace))
                    assert.ok(config.vhosts.v1.namespace != config.vhosts.v2.namespace)
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

            it('should append uuid to replyTo queues', function() {
                configure({
                    vhosts: {
                        v1: {
                            queues: {
                                q1: {
                                    replyTo: true
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.queues.q1.name, 'q1')
                    assert.ok(/q1:\w+-\w+-\w+-\w+-\w+/.test(config.vhosts.v1.queues.q1.fullyQualifiedName), format('%s failed to match expected pattern', config.vhosts.v1.queues.q1.fullyQualifiedName))
                })
            })

            it('should prefix dead letter exchange argument with specified namespace', function() {
                configure({
                    vhosts: {
                        v1: {
                            namespace: 'foo',
                            queues: {
                                q1: {
                                    options: {
                                        arguments: {
                                            'x-dead-letter-exchange': 'q1'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.queues.q1.name, 'q1')
                    assert.equal(config.vhosts.v1.queues.q1.options.arguments['x-dead-letter-exchange'], 'foo:q1')
                })
            })
        })

        describe('Bindings', function() {

            it('should configure bindings', function() {
                configure({
                    vhosts: {
                        v1: {
                            queues: {
                                q1: {
                                }
                            },
                            bindings: {
                                b1: {
                                    source: 'e1',
                                    destination: 'q1',
                                    bindingKey: '#'
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.bindings.b1.source, 'e1')
                    assert.equal(config.vhosts.v1.bindings.b1.destination, 'q1')
                    assert.equal(config.vhosts.v1.bindings.b1.bindingKey, '#')
                })
            })

            it('should convert "source -> destination" from binding key', function() {
                configure({
                    vhosts: {
                        v1: {
                            queues: {
                                q1: {
                                }
                            },
                            bindings: {
                                'e1 -> q1': {},
                                'e:1 -> q:1': {},
                                'e_1 -> q_1': {},
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.bindings['e1 -> q1'].source, 'e1')
                    assert.equal(config.vhosts.v1.bindings['e1 -> q1'].destination, 'q1')
                    assert.equal(config.vhosts.v1.bindings['e:1 -> q:1'].source, 'e:1')
                    assert.equal(config.vhosts.v1.bindings['e:1 -> q:1'].destination, 'q:1')
                    assert.equal(config.vhosts.v1.bindings['e_1 -> q_1'].source, 'e_1')
                    assert.equal(config.vhosts.v1.bindings['e_1 -> q_1'].destination, 'q_1')
                })
            })

            it('should convert "source[binding.key] -> destination" from binding key', function() {
                configure({
                    vhosts: {
                        v1: {
                            queues: {
                                q1: {
                                }
                            },
                            bindings: {
                                'e1[a] -> q1': {},
                                'e1[a.b] -> q1': {},
                                'e1[a,a.b] -> q1': {}
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.bindings['e1[a] -> q1'].bindingKey, 'a')
                    assert.equal(config.vhosts.v1.bindings['e1[a.b] -> q1'].bindingKey, 'a.b')
                    assert.equal(config.vhosts.v1.bindings['e1[a,a.b] -> q1:a'].bindingKey, 'a')
                    assert.equal(config.vhosts.v1.bindings['e1[a,a.b] -> q1:a.b'].bindingKey, 'a.b')
                })
            })

            it.only('should qualify bindings keys when specified', function() {
                configure({
                    vhosts: {
                        v1: {
                            namespace: 'ns1',
                            queues: {
                                q1: {
                                }
                            },
                            bindings: {
                                b1: {
                                    source: 'e1',
                                    destination: 'q1',
                                    bindingKey: 'q1',
                                    qualifyBindingKeys: true
                                },
                                'e1[q1] -> q1': {
                                    qualifyBindingKeys: true
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.bindings.b1.bindingKey, 'ns1:q1')
                    assert.equal(config.vhosts.v1.bindings['e1[q1] -> q1'].bindingKey, 'ns1:q1')
                })
            })

            it('should inflate bindings with empty structure', function() {
                configure({
                    vhosts: {
                        v1: {
                            queues: {
                                q1: {
                                }
                            },
                            bindings: {
                                b1: {
                                    destination: 'q1'
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
                            queues: {
                                q1: {
                                }
                            },
                            bindings: {
                                b1: {
                                    destination: 'q1'
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.bindings.b1.name, 'b1')
                })
            })

            it('should prefix bindingKey with replyTo uuid', function() {
                configure({
                    vhosts: {
                        v1: {
                            queues: {
                                q1: {
                                    replyTo: true
                                }
                            },
                            bindings: {
                                b1: {
                                    source: 'e1',
                                    destination: 'q1',
                                    destinationType: 'queue',
                                    bindingKey: 'foo.bar.#'
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.bindings.b1.source, 'e1')
                    assert.equal(config.vhosts.v1.bindings.b1.destination, 'q1')
                    assert.ok(/\w+-\w+-\w+-\w+-\w+\.foo\.bar\.#/.test(config.vhosts.v1.bindings.b1.bindingKey), format('%s failed to match expected pattern', config.vhosts.v1.bindings.b1.bindingKey))
                })
            }),

            it('should configure multiple bindings from an array of binding keys', function() {
                configure({
                    vhosts: {
                        v1: {
                            queues: {
                                q1: {
                                }
                            },
                            bindings: {
                                b1: {
                                    source: 'e1',
                                    destination: 'q1',
                                    bindingKeys: ['a', 'b']
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.bindings['b1:a'].source, 'e1')
                    assert.equal(config.vhosts.v1.bindings['b1:a'].destination, 'q1')
                    assert.equal(config.vhosts.v1.bindings['b1:a'].bindingKey, 'a')
                    assert.equal(config.vhosts.v1.bindings['b1:b'].source, 'e1')
                    assert.equal(config.vhosts.v1.bindings['b1:b'].destination, 'q1')
                    assert.equal(config.vhosts.v1.bindings['b1:b'].bindingKey, 'b')
                })
            })

            it('should configure single bindings from an array of binding keys', function() {
                configure({
                    vhosts: {
                        v1: {
                            queues: {
                                q1: {
                                }
                            },
                            bindings: {
                                b1: {
                                    source: 'e1',
                                    destination: 'q1',
                                    bindingKey: ['a']
                                }
                            }
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.bindings['b1'].source, 'e1')
                    assert.equal(config.vhosts.v1.bindings['b1'].destination, 'q1')
                    assert.equal(config.vhosts.v1.bindings['b1'].bindingKey, 'a')
                })
            })
        })
    })

    describe('Publications', function() {

        it('should configure exchange publications', function() {

            configure({
                vhosts: {
                    v1: {
                        exchanges: {
                            e1: {
                            }
                        }
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
                        queues: {
                            q1: {
                            }
                        }
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
                        exchanges: {
                            e1: {
                            }
                        }
                    }
                },
                publications: {
                    p1: {
                        vhost: 'v1',
                        exchange: 'e1'
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
                        exchanges: {
                            e1: {
                            }
                        },
                        queues: {
                            q1: {
                            }
                        }
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

        it('should replace destination its fully qualified names', function() {

            configure({
                vhosts: {
                    v1: {
                        namespace: 'foo',
                        exchanges: {
                            e1: {
                            }
                        },
                        queues: {
                            q1: {
                                replyTo: true
                            }
                        }
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
                assert.equal(config.publications.p1.destination, 'foo:e1')
                assert.ok(/foo:q1:\w+-\w+-\w+-\w+-\w+/.test(config.publications.p2.destination), format('%s failed to match expected pattern', config.publications.p2.destination))
            })
        })
    })

    describe('Subscriptions', function() {

        it('should configure queue subscriptions', function() {

            configure({
                vhosts: {
                    v1: {
                        queues: {
                            q1: {
                            }
                        }
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
                        queues: {
                            q1: {
                            }
                        }
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
                assert(_.isObject(config.subscriptions.s1.options))
            })
        })

        it('should decorate subscriptions with name and source', function() {

            configure({
                vhosts: {
                    v1: {
                        queues: {
                            q1: {
                            }
                        }
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

        it('should replace source with its fully qualified name', function() {

            configure({
                vhosts: {
                    v1: {
                        namespace: 'foo',
                        queues: {
                            q1: {
                                replyTo: true
                            }
                        }
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
                assert.ok(/foo:q1:\w+-\w+-\w+-\w+-\w+/.test(config.subscriptions.s1.source), format('%s failed to match expected pattern', config.subscriptions.s1.source))
            })
        })
    })
})
