var assert = require('assert')
var configure = require('../lib/config/configure')

describe('Defaults', function() {

  describe('Vhosts', function() {

    describe('Connection', function() {

      it('should use the default connection configuration', function() {
        configure({
          defaults: {
            vhosts: {
              connection: {
                slashes:true,
                protocol: 'amqp',
                hostname: 'localhost',
                user: 'guest',
                password: 'guest',
                port: '5672',
                options: {
                  heartbeat: 5
                },
                retry: {
                  delay: 1000
                }
              }
            }
          },
          vhosts: {
            v1: {
            }
          }
        }, function(err, config) {
          assert.ifError(err)
          assert.equal(config.vhosts.v1.connections[0].url, 'amqp://guest:guest@localhost:5672/v1?heartbeat=5')
        })
      })

      it('should permit the defaults to be overriden', function() {
        configure({
          defaults: {
            vhosts: {
              connection: {
                slashes:true,
                protocol: 'amqp',
                hostname: 'localhost',
                user: 'guest',
                password: 'guest',
                port: '5672',
                vhost: '',
                options: {
                  heartbeat: 10
                },
                retry: {
                  delay: 1000
                }
              }
            }
          },
          vhosts: {
            v1: {
              connection: {
                user: 'foo',
                password: 'bar'
              }
            }
          }
        }, function(err, config) {
          assert.ifError(err)
          assert.equal(config.vhosts.v1.connections[0].url, 'amqp://foo:bar@localhost:5672?heartbeat=10')
        })
      })
    })

    describe('Channel pooling', function() {

      it('should use the default publications channel pool sizes', function() {
        configure({
          defaults: {
            vhosts: {
              publicationChannelPools: {
                regularPoolSize: 2,
                confirmPoolSize: 3
              }
            }
          },
          vhosts: {
            v1: {
            }
          }
        }, function(err, config) {
          assert.ifError(err)
          assert.equal(config.vhosts.v1.publicationChannelPools.regularPoolSize, 2)
          assert.equal(config.vhosts.v1.publicationChannelPools.confirmPoolSize, 3)
        })
      })

      it('should permit the defaults to be overriden', function() {
        configure({
          defaults: {
            vhosts: {
              channelPoolSize: 3
            }
          },
          vhosts: {
            v1: {
              channelPoolSize: 5
            }
          }
        }, function(err, config) {
          assert.ifError(err)
          assert.equal(config.vhosts.v1.channelPoolSize, 5)
        })
      })
    })

    describe('Exchanges', function() {

      it('should use the default exchange configuration', function() {
        configure({
          defaults: {
            vhosts: {
              exchanges: {
                assert: true,
                type: 'topic',
                options: {
                  durable: true
                }
              }
            }
          },
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
          assert.equal(config.vhosts.v1.exchanges.e1.assert, true)
          assert.equal(config.vhosts.v1.exchanges.e1.type, 'topic')
          assert.equal(config.vhosts.v1.exchanges.e1.options.durable, true)
        })
      })

      it('should permit the defaults to be overriden', function() {
        configure({
          defaults: {
            vhosts: {
              exchanges: {
                assert: true,
                type: 'topic',
                options: {
                  durable: true
                }
              }
            }
          },
          vhosts: {
            v1: {
              exchanges: {
                e1: {
                  assert: false,
                  check: true,
                  type: 'direct',
                  options: {
                    durable: false,
                    autoDelete: true
                  }
                }
              }
            }
          }
        }, function(err, config) {
          assert.ifError(err)
          assert.equal(config.vhosts.v1.exchanges.e1.assert, false)
          assert.equal(config.vhosts.v1.exchanges.e1.check, true)
          assert.equal(config.vhosts.v1.exchanges.e1.type, 'direct')
          assert.equal(config.vhosts.v1.exchanges.e1.options.durable, false)
          assert.equal(config.vhosts.v1.exchanges.e1.options.autoDelete, true)
        })
      })
    })

    describe('Queues', function() {

      it('should use the default queue configuration', function() {
        configure({
          defaults: {
            vhosts: {
              queues: {
                assert: true,
                options: {
                  durable: true,
                  arguments: {
                    'x-dead-letter-exchange': 'dead_letters'
                  }
                }
              }
            }
          },
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
          assert.equal(config.vhosts.v1.queues.q1.assert, true)
          assert.equal(config.vhosts.v1.queues.q1.options.durable, true)
          assert.equal(config.vhosts.v1.queues.q1.options.arguments['x-dead-letter-exchange'], 'dead_letters')
        })
      })

      it('should permit the defaults to be overriden', function() {
        configure({
          defaults: {
            vhosts: {
              queues: {
                assert: true,
                options: {
                  durable: true
                }
              }
            }
          },
          vhosts: {
            v1: {
              queues: {
                q1: {
                  assert: false,
                  check: true,
                  options: {
                    durable: false,
                    autoDelete: true
                  }
                }
              }
            }
          }
        }, function(err, config) {
          assert.ifError(err)
          assert.equal(config.vhosts.v1.queues.q1.assert, false)
          assert.equal(config.vhosts.v1.queues.q1.check, true)
          assert.equal(config.vhosts.v1.queues.q1.options.durable, false)
          assert.equal(config.vhosts.v1.queues.q1.options.autoDelete, true)
        })
      })
    })

    describe('Bindings', function() {

      it('should use the default binding configuration', function() {
        configure({
          defaults: {
            vhosts: {
              bindings: {
                destinationType: 'queue',
                bindingKey: '#',
                options: {
                  foo: true
                }
              }
            }
          },
          vhosts: {
            v1: {
              queues: {
                q1: {
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
        }, function(err, config) {
          assert.ifError(err)
          assert.equal(config.vhosts.v1.bindings.b1.source, 'e1')
          assert.equal(config.vhosts.v1.bindings.b1.destination, 'q1')
          assert.equal(config.vhosts.v1.bindings.b1.destinationType, 'queue')
          assert.equal(config.vhosts.v1.bindings.b1.bindingKey, '#')
          assert.equal(config.vhosts.v1.bindings.b1.options.foo, true)
        })
      })

      it('should permit the defaults to be overriden', function() {
        configure({
          defaults: {
            vhosts: {
              bindings: {
                destinationType: 'queue',
                bindingKey: '#',
                options: {
                  foo: true
                }
              }

            }
          },
          vhosts: {
            v1: {
              bindings: {
                b1: {
                  source: 'e1',
                  destination: 'e2',
                  destinationType: 'exchange',
                  bindingKey: 'stuff',
                  options: {
                    foo: false,
                    bar: true
                  }
                }
              }
            }
          }
        }, function(err, config) {
          assert.ifError(err)
          assert.equal(config.vhosts.v1.bindings.b1.source, 'e1')
          assert.equal(config.vhosts.v1.bindings.b1.destination, 'e2')
          assert.equal(config.vhosts.v1.bindings.b1.destinationType, 'exchange')
          assert.equal(config.vhosts.v1.bindings.b1.bindingKey, 'stuff')
          assert.equal(config.vhosts.v1.bindings.b1.options.foo, false)
          assert.equal(config.vhosts.v1.bindings.b1.options.bar, true)
        })
      })
    })
  })

  describe('Publications', function() {

    it('should use the default publication configuration', function() {
      configure({
        defaults: {
          publications: {
            routingKey: '',
            options: {
              persistent: true
            }
          }
        },
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
        assert.equal(config.publications.p1.vhost, 'v1')
        assert.equal(config.publications.p1.destination, 'e1')
        assert.equal(config.publications.p1.routingKey, '')
        assert.equal(config.publications.p1.options.persistent, true)
      })
    })

    it('should permit the defaults to be overriden', function() {
      configure({
        defaults: {
          publications: {
            routingKey: '',
            options: {
              persistent: true
            }
          }
        },
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
            routingKey: 'stuff',
            options: {
              persistent: false
            }
          }
        }
      }, function(err, config) {
        assert.ifError(err)
        assert.equal(config.publications.p1.vhost, 'v1')
        assert.equal(config.publications.p1.destination, 'e1')
        assert.equal(config.publications.p1.routingKey, 'stuff')
        assert.equal(config.publications.p1.options.persistent, false)
      })
    })
  })

  describe('Subscriptions', function() {
    it('should use the default subscription configuration', function() {
      configure({
        defaults: {
          subscriptions: {
            options: {
              foo: true
            },
            prefetch: 100,
            retry: {
              delay: 1000
            }
          }
        },
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
        assert.equal(config.subscriptions.s1.vhost, 'v1')
        assert.equal(config.subscriptions.s1.source, 'q1')
        assert.equal(config.subscriptions.s1.prefetch, 100)
        assert.equal(config.subscriptions.s1.retry.delay, 1000)
        assert.equal(config.subscriptions.s1.options.foo, true)
      })
    })

    it('should permit the defaults to be overriden', function() {
      configure({
        defaults: {
          subscriptions: {
            options: {
              foo: true
            },
            prefetch: 100,
            retry: {
              delay: 1000
            }
          }
        },
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
            options: {
              foo: false,
              bar: true
            },
            prefetch: false,
            retry: {
              delay: 2000
            }
          }
        }
      }, function(err, config) {
        assert.ifError(err)
        assert.equal(config.subscriptions.s1.vhost, 'v1')
        assert.equal(config.subscriptions.s1.source, 'q1')
        assert.equal(config.subscriptions.s1.prefetch, false)
        assert.equal(config.subscriptions.s1.retry.delay, 2000)
        assert.equal(config.subscriptions.s1.options.foo, false)
        assert.equal(config.subscriptions.s1.options.bar, true)
      })
    })
  })

  describe('Redeliveries', function() {

    it('should apply default config based on counter type', function() {
      configure({
        defaults: {
          redeliveries: {
            counters: {
              inMemory:   {
                size: 99
              }
            }
          }
        },
        redeliveries: {
          counters: {
            stub: {},
            inMemory: {
              type: 'inMemory'
            }
          }
        }
      }, function(err, config) {
        assert.ifError(err)
        assert.equal(config.redeliveries.counters.stub.name, 'stub')
        assert.equal(config.redeliveries.counters.stub.size, undefined)
        assert.equal(config.redeliveries.counters.inMemory.name, 'inMemory')
        assert.equal(config.redeliveries.counters.inMemory.size, 99)
      })
    })

    it('should apply default config based on counter name', function() {
      configure({
        defaults: {
          redeliveries: {
            counters: {
              inMemory:   {
                size: 99
              }
            }
          }
        },
        redeliveries: {
          counters: {
            stub: {},
            inMemory: {}
          }
        }
      }, function(err, config) {
        assert.ifError(err)
        assert.equal(config.redeliveries.counters.stub.name, 'stub')
        assert.equal(config.redeliveries.counters.stub.size, undefined)
        assert.equal(config.redeliveries.counters.inMemory.name, 'inMemory')
        assert.equal(config.redeliveries.counters.inMemory.size, 99)
      })
    })
  })
})
