const assert = require('assert');
const _ = require('lodash');
const uuid = require('uuid').v4;
const format = require('util').format;
const testConfig = require('../lib/config/tests');
const BrokerAsPromised = require('..').BrokerAsPromised;

describe(
  'Broker As Promised',
  () => {
    let broker;
    let namespace;
    let vhosts;
    let publications;
    let subscriptions;

    beforeEach(() => {
      namespace = uuid();

      vhosts = {
        '/': {
          connection: {
            management: {
              options: {
                timeout: 5000,
              },
            },
          },
          namespace,
          exchanges: {
            e1: {
              assert: true,
            },
          },
          queues: {
            q1: {
              assert: true,
            },
          },
          subscriptions: {
            s1: {
              queue: 'q1',
            },
          },
          publications: {
            p1: {
              exchange: 'e1',
            },
          },
          bindings: {
            b1: {
              source: 'e1',
              destination: 'q1',
            },
          },
        },
      };

      publications = {
        p1: {
          vhost: '/',
          exchange: 'e1',
          routingKey: 'foo',
        },
      };

      subscriptions = {
        s1: {
          vhost: '/',
          queue: 'q1',
        },
      };
    });

    afterEach(() => {
      if (broker) return broker.nuke();
    });

    it('should assert vhosts', () => {
      const vhostName = uuid();
      const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)['/']);
      customVhosts[vhostName].assert = true;

      const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
      return createBroker(config);
    });

    it('should fail when checking vhosts that dont exist', () => {
      const vhostName = uuid();
      const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)['/']);
      customVhosts[vhostName].check = true;

      const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
      return createBroker(config).catch((err) => {
        assert.ok(err);
        assert.strictEqual(err.message, format('Failed to check vhost: %s. http://guest:***@localhost:15672 returned status 404', vhostName));
      });
    });

    it('should not fail when checking vhosts that do exist', () => {
      const vhostName = uuid();
      const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)['/']);
      customVhosts[vhostName].assert = true;
      customVhosts[vhostName].check = true;

      const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
      return createBroker(config);
    });

    it('should delete vhosts', () => {
      const vhostName = uuid();
      const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)['/']);
      customVhosts[vhostName].assert = true;

      const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
      return createBroker(config).then((broker) => {
        return broker.nuke().then(() => {
          config.vhosts[vhostName].assert = false;
          config.vhosts[vhostName].check = true;
          return createBroker(config).catch((err) => {
            assert.ok(err);
            assert.strictEqual(err.message, format('Failed to check vhost: %s. http://guest:***@localhost:15672 returned status 404', vhostName));
          });
        });
      });
    });

    it('should provide fully qualified name', () => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      return createBroker(config).then((broker) => {
        assert.strictEqual(namespace + ':q1', broker.getFullyQualifiedName('/', 'q1'));
      });
    });

    it('should not modify configuration', () => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      const json = JSON.stringify(config, null, 2);
      return createBroker(config).then(() => {
        assert.strictEqual(json, JSON.stringify(config, null, 2));
      });
    });

    it('should nuke', () => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      return createBroker(config).then((broker) => {
        return broker.nuke();
      });
    });

    it('should cancel subscriptions', (test, done) => {
      const config = _.defaultsDeep(
        {
          vhosts,
          publications,
          subscriptions,
        },
        testConfig
      );

      createBroker(config).then((broker) => {
        broker.subscribe('s1').then((subscription) => {
          subscription.on('message', () => {
            assert(false, 'No message should have been received');
          });

          broker.unsubscribeAll().then(() => {
            broker.publish('p1', 'test message').then(() => {
              setTimeout(done, 500);
            });
          });
        });
      });
    });

    it('should connect', () => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      return createBroker(config).then((broker) => {
        return broker.connect('/').then((connection) => {
          assert.ok(connection._rascal_id);
          return connection.close();
        });
      });
    });

    it('should subscribe to all subscriptions', () => {
      const config = _.defaultsDeep(
        {
          vhosts,
          publications,
          subscriptions,
        },
        testConfig
      );

      return createBroker(config).then((broker) => {
        return broker.subscribeAll().then((subscriptions) => {
          assert.strictEqual(subscriptions.length, 2);
          assert.strictEqual(subscriptions[0].constructor.name, 'SubscriberSessionAsPromised');
          assert.strictEqual(subscriptions[0].name, 's1');
          assert.strictEqual(subscriptions[1].name, '/q1');
        });
      });
    });

    it('should subscribe to all filtered subscriptions', () => {
      const config = _.defaultsDeep(
        {
          vhosts,
          publications,
          subscriptions,
        },
        testConfig
      );

      return createBroker(config).then((broker) => {
        return broker
          .subscribeAll((subscriptionConfig) => {
            return !subscriptionConfig.autoCreated;
          })
          .then((subscriptions) => {
            assert.strictEqual(subscriptions.length, 1);
            assert.strictEqual(subscriptions[0].constructor.name, 'SubscriberSessionAsPromised');
            assert.strictEqual(subscriptions[0].name, 's1');
          });
      });
    });

    it('should get vhost connections', () => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      return createBroker(config).then((broker) => {
        const connections = broker.getConnections();
        assert.strictEqual(connections.length, 1);
        assert.strictEqual(connections[0].vhost, '/');
        assert.strictEqual(connections[0].connectionUrl, 'amqp://guest:***@localhost:5672?heartbeat=50&connection_timeout=10000&channelMax=100', broker.getConnections()['/']);
      });
    });

    function createBroker(config) {
      return BrokerAsPromised.create(config)
        .catch((err) => {
          if (err.broker) broker = err[err.broker];
          throw err;
        })
        .then((_broker) => {
          broker = _broker;
          return broker;
        });
    }
  },
  { timeout: 6000 }
);
