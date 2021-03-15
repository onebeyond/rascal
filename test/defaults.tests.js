const assert = require('assert');
const configure = require('../lib/config/configure');

describe('Defaults', () => {

  describe('Vhosts', () => {

    describe('Connection', () => {

      it('should use the default connection configuration', () => {
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
                  heartbeat: 5,
                },
                retry: {
                  delay: 1000,
                },
              },
            },
          },
          vhosts: {
            v1: {
            },
          },
        }, (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.vhosts.v1.connections[0].url, 'amqp://guest:guest@localhost:5672/v1?heartbeat=5');
        });
      });

      it('should permit the defaults to be overriden', () => {
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
                  heartbeat: 10,
                },
                retry: {
                  delay: 1000,
                },
              },
            },
          },
          vhosts: {
            v1: {
              connection: {
                user: 'foo',
                password: 'bar',
              },
            },
          },
        }, (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.vhosts.v1.connections[0].url, 'amqp://foo:bar@localhost:5672?heartbeat=10');
        });
      });
    });

    describe('Channel pooling', () => {

      it('should use the default publications channel pool sizes', () => {
        configure({
          defaults: {
            vhosts: {
              publicationChannelPools: {
                regularPool: {
                  min: 2,
                  max: 3,
                  autostart: true,
                },
                confirmPool: {
                  min: 4,
                  max: 5,
                  autostart: true,
                },
              },
            },
          },
          vhosts: {
            v1: {
            },
          },
        }, (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.vhosts.v1.publicationChannelPools.regularPool.min, 2);
          assert.strictEqual(config.vhosts.v1.publicationChannelPools.regularPool.max, 3);
          assert.strictEqual(config.vhosts.v1.publicationChannelPools.regularPool.autostart, true);
          assert.strictEqual(config.vhosts.v1.publicationChannelPools.confirmPool.min, 4);
          assert.strictEqual(config.vhosts.v1.publicationChannelPools.confirmPool.max, 5);
          assert.strictEqual(config.vhosts.v1.publicationChannelPools.confirmPool.autostart, true);
        });
      });

      it('should permit the defaults to be overriden', () => {
        configure({
          defaults: {
            vhosts: {
              channelPoolSize: 3,
            },
          },
          vhosts: {
            v1: {
              channelPoolSize: 5,
            },
          },
        }, (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.vhosts.v1.channelPoolSize, 5);
        });
      });
    });

    describe('Exchanges', () => {

      it('should use the default exchange configuration', () => {
        configure({
          defaults: {
            vhosts: {
              exchanges: {
                assert: true,
                type: 'topic',
                options: {
                  durable: true,
                },
              },
            },
          },
          vhosts: {
            v1: {
              exchanges: {
                e1: {
                },
              },
            },
          },
        }, (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.vhosts.v1.exchanges.e1.assert, true);
          assert.strictEqual(config.vhosts.v1.exchanges.e1.type, 'topic');
          assert.strictEqual(config.vhosts.v1.exchanges.e1.options.durable, true);
        });
      });

      it('should permit the defaults to be overriden', () => {
        configure({
          defaults: {
            vhosts: {
              exchanges: {
                assert: true,
                type: 'topic',
                options: {
                  durable: true,
                },
              },
            },
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
                    autoDelete: true,
                  },
                },
              },
            },
          },
        }, (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.vhosts.v1.exchanges.e1.assert, false);
          assert.strictEqual(config.vhosts.v1.exchanges.e1.check, true);
          assert.strictEqual(config.vhosts.v1.exchanges.e1.type, 'direct');
          assert.strictEqual(config.vhosts.v1.exchanges.e1.options.durable, false);
          assert.strictEqual(config.vhosts.v1.exchanges.e1.options.autoDelete, true);
        });
      });
    });

    describe('Queues', () => {

      it('should use the default queue configuration', () => {
        configure({
          defaults: {
            vhosts: {
              queues: {
                assert: true,
                options: {
                  durable: true,
                  arguments: {
                    'x-dead-letter-exchange': 'dead_letters',
                  },
                },
              },
            },
          },
          vhosts: {
            v1: {
              queues: {
                q1: {
                },
              },
            },
          },
        }, (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.vhosts.v1.queues.q1.assert, true);
          assert.strictEqual(config.vhosts.v1.queues.q1.options.durable, true);
          assert.strictEqual(config.vhosts.v1.queues.q1.options.arguments['x-dead-letter-exchange'], 'dead_letters');
        });
      });

      it('should permit the defaults to be overriden', () => {
        configure({
          defaults: {
            vhosts: {
              queues: {
                assert: true,
                options: {
                  durable: true,
                },
              },
            },
          },
          vhosts: {
            v1: {
              queues: {
                q1: {
                  assert: false,
                  check: true,
                  options: {
                    durable: false,
                    autoDelete: true,
                  },
                },
              },
            },
          },
        }, (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.vhosts.v1.queues.q1.assert, false);
          assert.strictEqual(config.vhosts.v1.queues.q1.check, true);
          assert.strictEqual(config.vhosts.v1.queues.q1.options.durable, false);
          assert.strictEqual(config.vhosts.v1.queues.q1.options.autoDelete, true);
        });
      });
    });

    describe('Bindings', () => {

      it('should use the default binding configuration', () => {
        configure({
          defaults: {
            vhosts: {
              bindings: {
                destinationType: 'queue',
                bindingKey: '#',
                options: {
                  foo: true,
                },
              },
            },
          },
          vhosts: {
            v1: {
              queues: {
                q1: {
                },
              },
              bindings: {
                b1: {
                  source: 'e1',
                  destination: 'q1',
                },
              },
            },
          },
        }, (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.vhosts.v1.bindings.b1.source, 'e1');
          assert.strictEqual(config.vhosts.v1.bindings.b1.destination, 'q1');
          assert.strictEqual(config.vhosts.v1.bindings.b1.destinationType, 'queue');
          assert.strictEqual(config.vhosts.v1.bindings.b1.bindingKey, '#');
          assert.strictEqual(config.vhosts.v1.bindings.b1.options.foo, true);
        });
      });

      it('should permit the defaults to be overriden', () => {
        configure({
          defaults: {
            vhosts: {
              bindings: {
                destinationType: 'queue',
                bindingKey: '#',
                options: {
                  foo: true,
                },
              },

            },
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
                    bar: true,
                  },
                },
              },
            },
          },
        }, (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.vhosts.v1.bindings.b1.source, 'e1');
          assert.strictEqual(config.vhosts.v1.bindings.b1.destination, 'e2');
          assert.strictEqual(config.vhosts.v1.bindings.b1.destinationType, 'exchange');
          assert.strictEqual(config.vhosts.v1.bindings.b1.bindingKey, 'stuff');
          assert.strictEqual(config.vhosts.v1.bindings.b1.options.foo, false);
          assert.strictEqual(config.vhosts.v1.bindings.b1.options.bar, true);
        });
      });
    });
  });

  describe('Publications', () => {

    it('should use the default publication configuration', () => {
      configure({
        defaults: {
          publications: {
            routingKey: '',
            options: {
              persistent: true,
            },
          },
        },
        vhosts: {
          v1: {
            exchanges: {
              e1: {
              },
            },
          },
        },
        publications: {
          p1: {
            vhost: 'v1',
            exchange: 'e1',
          },
        },
      }, (err, config) => {
        assert.ifError(err);
        assert.strictEqual(config.publications.p1.vhost, 'v1');
        assert.strictEqual(config.publications.p1.destination, 'e1');
        assert.strictEqual(config.publications.p1.routingKey, '');
        assert.strictEqual(config.publications.p1.options.persistent, true);
      });
    });

    it('should permit the defaults to be overriden', () => {
      configure({
        defaults: {
          publications: {
            routingKey: '',
            options: {
              persistent: true,
            },
          },
        },
        vhosts: {
          v1: {
            exchanges: {
              e1: {
              },
            },
          },
        },
        publications: {
          p1: {
            vhost: 'v1',
            exchange: 'e1',
            routingKey: 'stuff',
            options: {
              persistent: false,
            },
          },
        },
      }, (err, config) => {
        assert.ifError(err);
        assert.strictEqual(config.publications.p1.vhost, 'v1');
        assert.strictEqual(config.publications.p1.destination, 'e1');
        assert.strictEqual(config.publications.p1.routingKey, 'stuff');
        assert.strictEqual(config.publications.p1.options.persistent, false);
      });
    });
  });

  describe('Subscriptions', () => {
    it('should use the default subscription configuration', () => {
      configure({
        defaults: {
          subscriptions: {
            options: {
              foo: true,
            },
            prefetch: 100,
            retry: {
              delay: 1000,
            },
          },
        },
        vhosts: {
          v1: {
            queues: {
              q1: {
              },
            },
          },
        },
        subscriptions: {
          s1: {
            vhost: 'v1',
            queue: 'q1',
          },
        },
      }, (err, config) => {
        assert.ifError(err);
        assert.strictEqual(config.subscriptions.s1.vhost, 'v1');
        assert.strictEqual(config.subscriptions.s1.source, 'q1');
        assert.strictEqual(config.subscriptions.s1.prefetch, 100);
        assert.strictEqual(config.subscriptions.s1.retry.delay, 1000);
        assert.strictEqual(config.subscriptions.s1.options.foo, true);
      });
    });

    it('should permit the defaults to be overriden', () => {
      configure({
        defaults: {
          subscriptions: {
            options: {
              foo: true,
            },
            prefetch: 100,
            retry: {
              delay: 1000,
            },
          },
        },
        vhosts: {
          v1: {
            queues: {
              q1: {
              },
            },
          },
        },
        subscriptions: {
          s1: {
            vhost: 'v1',
            queue: 'q1',
            options: {
              foo: false,
              bar: true,
            },
            prefetch: false,
            retry: {
              delay: 2000,
            },
          },
        },
      }, (err, config) => {
        assert.ifError(err);
        assert.strictEqual(config.subscriptions.s1.vhost, 'v1');
        assert.strictEqual(config.subscriptions.s1.source, 'q1');
        assert.strictEqual(config.subscriptions.s1.prefetch, false);
        assert.strictEqual(config.subscriptions.s1.retry.delay, 2000);
        assert.strictEqual(config.subscriptions.s1.options.foo, false);
        assert.strictEqual(config.subscriptions.s1.options.bar, true);
      });
    });
  });

  describe('Redeliveries', () => {

    it('should apply default config based on counter type', () => {
      configure({
        defaults: {
          redeliveries: {
            counters: {
              inMemory:   {
                size: 99,
              },
            },
          },
        },
        redeliveries: {
          counters: {
            stub: {},
            inMemory: {
              type: 'inMemory',
            },
          },
        },
      }, (err, config) => {
        assert.ifError(err);
        assert.strictEqual(config.redeliveries.counters.stub.name, 'stub');
        assert.strictEqual(config.redeliveries.counters.stub.size, undefined);
        assert.strictEqual(config.redeliveries.counters.inMemory.name, 'inMemory');
        assert.strictEqual(config.redeliveries.counters.inMemory.size, 99);
      });
    });

    it('should apply default config based on counter name', () => {
      configure({
        defaults: {
          redeliveries: {
            counters: {
              inMemory:   {
                size: 99,
              },
            },
          },
        },
        redeliveries: {
          counters: {
            stub: {},
            inMemory: {},
          },
        },
      }, (err, config) => {
        assert.ifError(err);
        assert.strictEqual(config.redeliveries.counters.stub.name, 'stub');
        assert.strictEqual(config.redeliveries.counters.stub.size, undefined);
        assert.strictEqual(config.redeliveries.counters.inMemory.name, 'inMemory');
        assert.strictEqual(config.redeliveries.counters.inMemory.size, 99);
      });
    });
  });
});
