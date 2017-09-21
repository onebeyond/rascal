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
                    assert.equal(config.vhosts.v1.connections[0].url, 'protocol://user:password@hostname:9000/vhost?heartbeat=10&channelMax=100')
                })
            })

            it('should configure the connection from a string', function() {
                configure({
                    vhosts: {
                        v1: {
                            connection: "amqp://localhost"
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.connections[0].url, 'amqp://localhost')
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
                    assert.equal(config.vhosts.v1.connections[0].url, 'foo')
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
                    assert.equal(config.vhosts.v1.connections[0].loggableUrl, 'protocol://user:***@hostname:9000/v1?heartbeat=10&channelMax=100')
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
                    assert.equal(config.vhosts['/'].connections[0].loggableUrl, 'protocol://user:***@hostname:9000?heartbeat=10&channelMax=100')
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
                    assert.equal(config.vhosts.v1.connections[0].loggableUrl, 'protocol://user:***@hostname:9000/vhost?heartbeat=10&channelMax=100')
                })
            })

            it('should generate connections from an array', function() {
                configure({
                    vhosts: {
                        v1: {
                            connections: [
                                {
                                    url: 'foo'
                                },
                                {
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
                            ]
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.equal(config.vhosts.v1.connections[0].url, 'foo')
                    assert.equal(config.vhosts.v1.connections[1].url, 'protocol://user:password@hostname:9000/vhost?heartbeat=10&channelMax=100')
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
                    assert.equal(config.vhosts.v1.connections[0].loggableUrl, 'protocol://user:***@hostname:9000/vhost?heartbeat=10&channelMax=100')
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
                    assert.ok(config.vhosts.v1.namespace !== config.vhosts.v2.namespace)
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

           it('should support array of names configuration', function() {
                configure({
                    vhosts: {
                        v1: {
                            exchanges: [ 'e1', 'e2' ]
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.ok(!_.isArray(config.vhosts.v1.exchanges))
                    assert.equal(config.vhosts.v1.exchanges.e1.name, 'e1')
                    assert.equal(config.vhosts.v1.exchanges.e1.fullyQualifiedName, 'e1')

                    assert.equal(config.vhosts.v1.exchanges.e2.name, 'e2')
                    assert.equal(config.vhosts.v1.exchanges.e2.fullyQualifiedName, 'e2')
                })
            })

           it('should support a mixed array of names / objects configuration', function() {
                configure({
                    vhosts: {
                        v1: {
                            exchanges: [ 'e1', { name: 'e2' } ]
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.ok(!_.isArray(config.vhosts.v1.exchanges))
                    assert.equal(config.vhosts.v1.exchanges.e1.name, 'e1')
                    assert.equal(config.vhosts.v1.exchanges.e1.fullyQualifiedName, 'e1')

                    assert.equal(config.vhosts.v1.exchanges.e2.name, 'e2')
                    assert.equal(config.vhosts.v1.exchanges.e2.fullyQualifiedName, 'e2')
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

            it('should support a mixed array of names / objects configuration', function() {
                configure({
                    vhosts: {
                        v1: {
                            queues: ['q1', 'q2']
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.ok(!_.isArray(config.vhosts.v1.queues))
                    assert.equal(config.vhosts.v1.queues.q1.name, 'q1')
                    assert.equal(config.vhosts.v1.queues.q1.fullyQualifiedName, 'q1')

                    assert.equal(config.vhosts.v1.queues.q2.name, 'q2')
                    assert.equal(config.vhosts.v1.queues.q2.fullyQualifiedName, 'q2')
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
                                'e_1 -> q_1': {}
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

            it('should qualify bindings keys when specified', function() {
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
            }),

            it('should support a mixed array of names / objects configuration', function() {
                configure({
                    vhosts: {
                        v1: {
                            queues: [
                                'q1',
                                'q2'
                            ],
                            bindings: [
                                'e1 -> q1',
                                'e1 -> q2'
                            ]
                        }
                    }
                }, function(err, config) {
                    assert.ifError(err)
                    assert.ok(!_.isArray(config.vhosts.v1.bindings))
                    assert.equal(config.vhosts.v1.bindings['e1 -> q1'].source, 'e1')
                    assert.equal(config.vhosts.v1.bindings['e1 -> q1'].destination, 'q1')

                    assert.equal(config.vhosts.v1.bindings['e1 -> q2'].source, 'e1')
                    assert.equal(config.vhosts.v1.bindings['e1 -> q2'].destination, 'q2')
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

        it('should default the publication vhost to the vhost in the surrounding block', function() {
            configure({
                vhosts: {
                    v1: {
                        exchanges: ['e1'],
                        publications: {
                            p1: {
                                exchange: 'e1'
                            }
                        }
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.ok(!config.vhosts.v1.publications)
                assert.equal(config.publications.p1.vhost, 'v1')
                assert.equal(config.publications.p1.destination, 'e1')
            })
        })

        it('should create a default publication for each exchange', function() {
            configure({
                vhosts: {
                    '/': {
                        exchanges: ['e1']
                    },
                    v1: {
                        exchanges: ['e1']
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.ok(!config.vhosts.v1.publications)

                assert.equal(config.publications.e1.vhost, 'v1')
                assert.equal(config.publications.e1.destination, 'e1')
                assert.equal(config.publications.e1.autoCreated, true)
                assert.equal(config.publications.e1.deprecated, true)

                assert.equal(config.publications['/e1'].vhost, '/')
                assert.equal(config.publications['/e1'].destination, 'e1')
                assert.equal(config.publications['/e1'].autoCreated, true)
                assert.equal(config.publications['/e1'].deprecated, undefined)

                assert.equal(config.publications['v1/e1'].vhost, 'v1')
                assert.equal(config.publications['v1/e1'].destination, 'e1')
                assert.equal(config.publications['v1/e1'].autoCreated, true)
                assert.equal(config.publications['v1/e1'].deprecated, undefined)
            })
        })

        it('should not override an explicit vhost publication with a default exchange publication', function() {
            configure({
                vhosts: {
                    v1: {
                        exchanges: ['e1'],
                        publications: {
                            e1: {
                                exchange: 'e1',
                                routingKey: 'r1'
                            }
                        }
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.ok(!config.vhosts.v1.publications)
                assert.equal(config.publications.e1.vhost, 'v1')
                assert.equal(config.publications.e1.destination, 'e1')
                assert.equal(config.publications.e1.routingKey, 'r1')
            })
        })

        it('should not override an explicit root level exchange publication with a default exchange publication', function() {
            configure({
                vhosts: {
                    v1: {
                        exchanges: ['e1']
                    }
                },
                publications: {
                    e1: {
                        exchange: 'e1',
                        vhost: 'v1',
                        routingKey: 'r1'
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.ok(!config.vhosts.v1.publications)
                assert.equal(config.publications.e1.vhost, 'v1')
                assert.equal(config.publications.e1.destination, 'e1')
                assert.equal(config.publications.e1.routingKey, 'r1')
            })
        })

        it('should create a default publication for each queue', function() {
            configure({
                vhosts: {
                    '/': {
                        queues: ['q1']
                    },
                    v1: {
                        queues: ['q1']
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.ok(!config.vhosts.v1.publications)

                assert.equal(config.publications.q1.vhost, 'v1')
                assert.equal(config.publications.q1.destination, 'q1')
                assert.equal(config.publications.q1.autoCreated, true)
                assert.equal(config.publications.q1.deprecated, true)

                assert.equal(config.publications['/q1'].vhost, '/')
                assert.equal(config.publications['/q1'].destination, 'q1')
                assert.equal(config.publications['/q1'].autoCreated, true)
                assert.equal(config.publications['/q1'].deprecated, undefined)

                assert.equal(config.publications['v1/q1'].vhost, 'v1')
                assert.equal(config.publications['v1/q1'].destination, 'q1')
                assert.equal(config.publications['v1/q1'].autoCreated, true)
                assert.equal(config.publications['v1/q1'].deprecated, undefined)
            })
        })

        it('should not override an explicit vhost publication with a default queue publication', function() {
            configure({
                vhosts: {
                    v1: {
                        queues: ['q1'],
                        publications: {
                            q1: {
                                queue: 'q1',
                                routingKey: 'r1'
                            }
                        }
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.ok(!config.vhosts.v1.publications)
                assert.equal(config.publications.q1.vhost, 'v1')
                assert.equal(config.publications.q1.destination, 'q1')
                assert.equal(config.publications.q1.routingKey, 'r1')
            })
        })

        it('should not override an explicit root level publication with a default queue publication', function() {
            configure({
                vhosts: {
                    v1: {
                        queues: ['q1']
                    }
                },
                publications: {
                    q1: {
                        queue: 'q1',
                        vhost: 'v1',
                        routingKey: 'r1'
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.ok(!config.vhosts.v1.publications)
                assert.equal(config.publications.q1.vhost, 'v1')
                assert.equal(config.publications.q1.destination, 'q1')
                assert.equal(config.publications.q1.routingKey, 'r1')
            })
        })

        it('should create a default subscription for each queue', function() {
            configure({
                vhosts: {
                    '/': {
                        queues: ['q1']
                    },
                    v1: {
                        queues: ['q1']
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.ok(!config.vhosts.v1.subscriptions)

                assert.equal(config.subscriptions.q1.vhost, 'v1')
                assert.equal(config.subscriptions.q1.source, 'q1')
                assert.equal(config.subscriptions.q1.autoCreated, true)
                assert.equal(config.subscriptions.q1.deprecated, true)

                assert.equal(config.subscriptions['/q1'].vhost, '/')
                assert.equal(config.subscriptions['/q1'].source, 'q1')
                assert.equal(config.subscriptions['/q1'].autoCreated, true)
                assert.equal(config.subscriptions['/q1'].deprecated, undefined)

                assert.equal(config.subscriptions['v1/q1'].vhost, 'v1')
                assert.equal(config.subscriptions['v1/q1'].source, 'q1')
                assert.equal(config.subscriptions['v1/q1'].autoCreated, true)
                assert.equal(config.subscriptions['v1/q1'].deprecated, undefined)
            })
        })

        it('should not override an explicit vhost subscription with a default queue subscription', function() {
            configure({
                vhosts: {
                    v1: {
                        queues: ['q1'],
                        subscriptions: {
                            q1: {
                                queue: 'q1',
                                routingKey: 'r1'
                            }
                        }
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.ok(!config.vhosts.v1.subscriptions)
                assert.equal(config.subscriptions.q1.vhost, 'v1')
                assert.equal(config.subscriptions.q1.source, 'q1')
                assert.equal(config.subscriptions.q1.routingKey, 'r1')
            })
        })

        it('should not override and explicit root level subscription with a default queue subscription', function() {
            configure({
                vhosts: {
                    v1: {
                        queues: ['q1']
                    }
                },
                subscriptions: {
                    q1: {
                        queue: 'q1',
                        vhost: 'v1',
                        contentType: 'text/plain'
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.ok(!config.vhosts.v1.subscriptions)
                assert.equal(config.subscriptions.q1.vhost, 'v1')
                assert.equal(config.subscriptions.q1.source, 'q1')
                assert.equal(config.subscriptions.q1.contentType, 'text/plain')
            })
        })

        it('should should merge implicit vhost publications with explicit publications', function() {
            configure({
                vhosts: {
                    v1: {
                        exchanges: ['e1', 'e2'],
                        publications: {
                            p1: {
                                exchange: 'e1'
                            }
                        }
                    }
                },
                publications: {
                    p2: {
                        vhost: 'v1',
                        exchange: 'e2'
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.ok(!config.vhosts.v1.publications)
                assert.equal(config.publications.p1.vhost, 'v1')
                assert.equal(config.publications.p1.exchange, 'e1')
                assert.equal(config.publications.p2.vhost, 'v1')
                assert.equal(config.publications.p2.exchange, 'e2')
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

        it('should report duplicate subscriptions', function() {

            configure({
                vhosts: {
                    v1: {
                        queues: {
                            q1: {
                            }
                        },
                        subscriptions: {
                            s1: {
                                queue: 'q1'
                            }
                        }
                    },
                    v2: {
                        queues: {
                            q1: {
                            }
                        },
                        subscriptions: {
                            s1: {
                                queue: 'q1'
                            }
                        }
                    }
                }
            }, function(err, config) {
                assert.equal(err.message, 'Duplicate subscription: s1')
            })
        })

        it('should report duplicate publications', function() {

            configure({
                vhosts: {
                    v1: {
                        exchanges: {
                            e1: {
                            }
                        },
                        publications: {
                            p1: {
                                exchange: 'e1'
                            }
                        }
                    },
                    v2: {
                        exchanges: {
                            e1: {
                            }
                        },
                        publications: {
                            p1: {
                                exchange: 'e1'
                            }
                        }
                    }
                }
            }, function(err, config) {
                assert.equal(err.message, 'Duplicate publication: p1')
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

        it('should default the subscription vhost to the vhost in the surrounding block', function() {
            configure({
                vhosts: {
                    v1: {
                        queues: ['q1'],
                        subscriptions: {
                            s1: {
                                queue: 'q1'
                            }
                        }
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.ok(!config.vhosts.v1.subscriptions)
                assert.equal(config.subscriptions.s1.vhost, 'v1')
                assert.equal(config.subscriptions.s1.queue, 'q1')
            })
        })

        it('should should merge implicit vhost subscriptions with explicit subscriptions', function() {
            configure({
                vhosts: {
                    v1: {
                        queues: ['q1', 'q2'],
                        subscriptions: {
                            s1: {
                                queue: 'q1'
                            }
                        }
                    }
                },
                subscriptions: {
                    s2: {
                        queue: 'q2',
                        vhost: 'v1'
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.ok(!config.vhosts.v1.subscriptions)
                assert.equal(config.subscriptions.s1.vhost, 'v1')
                assert.equal(config.subscriptions.s1.queue, 'q1')
                assert.equal(config.subscriptions.s2.vhost, 'v1')
                assert.equal(config.subscriptions.s2.queue, 'q2')
            })
        })
    })

    describe('Shovels', function() {

        it('should decorate subscriptions with name', function() {

            configure({
                shovels: {
                    x1: {
                        subscription: 's1',
                        publication: 'p1'
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.equal(config.shovels.x1.name, 'x1')
            })
        })

        it('should convert "subscription -> publication" to shovel', function() {
            configure({
                shovels: [
                    's1 -> p1'
                ]
            }, function(err, config) {
                assert.ifError(err)
                assert.equal(config.shovels['s1 -> p1'].subscription, 's1')
                assert.equal(config.shovels['s1 -> p1'].publication, 'p1')
            })
        })
    })

    describe('Redelivery Counters', function() {

        it('should decorate counter with name and type', function() {

            configure({
                redeliveries: {
                    counters: {
                        stub: {},
                        inMemory: {}
                    }
                }
            }, function(err, config) {
                assert.ifError(err)
                assert.equal(config.redeliveries.counters.stub.name, 'stub')
                assert.equal(config.redeliveries.counters.stub.type, 'stub')
                assert.equal(config.redeliveries.counters.inMemory.name, 'inMemory')
                assert.equal(config.redeliveries.counters.inMemory.type, 'inMemory')
            })
        })
    })
})
