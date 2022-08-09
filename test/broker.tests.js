const assert = require('assert');
const _ = require('lodash');
const uuid = require('uuid').v4;
const format = require('util').format;
const random = require('random-readable');
const superAgent = require('superagent-defaults');
const amqplib = require('amqplib/callback_api');
const testConfig = require('../lib/config/tests');
const Broker = require('..').Broker;
const AmqpUtils = require('./utils/amqputils');

describe(
  'Broker',
  () => {
    let broker;
    let amqputils;
    let namespace;
    let vhosts;
    let publications;
    let subscriptions;

    beforeEach((test, done) => {
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
            p2: {
              exchange: 'e1',
              confirm: false,
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

      amqplib.connect((err, connection) => {
        if (err) return done(err);
        amqputils = AmqpUtils.init(connection);
        done();
      });
    });

    afterEach((test, done) => {
      amqputils.disconnect(() => {
        if (broker) return broker.nuke(done);
        done();
      });
    });

    it('should assert vhosts', (test, done) => {
      const vhostName = uuid();
      const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)['/']);
      customVhosts[vhostName].assert = true;

      const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
      createBroker(config, (err) => {
        assert.ifError(err);
        done();
      });
    });

    it('should fail to assert vhost when unable to connect to management plugin', (test, done) => {
      const vhostName = uuid();
      const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)['/']);
      customVhosts[vhostName].assert = true;
      customVhosts[vhostName].connection.management.port = 65535;

      const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
      createBroker(config, (err) => {
        assert.ok(err);
        assert.ok(/Failed to assert vhost: .*\. http:\/\/guest:\*\*\*@localhost:65535 errored with: .*ECONNREFUSED.*/.test(err.message), err.message);
        done();
      });
    });

    it('should fail when checking vhosts that dont exist', (test, done) => {
      const vhostName = uuid();
      const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)['/']);
      customVhosts[vhostName].check = true;

      const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
      createBroker(config, (err) => {
        assert.ok(err);
        assert.strictEqual(err.message, format('Failed to check vhost: %s. http://guest:***@localhost:15672 returned status 404', vhostName));
        done();
      });
    });

    it('should fail to check vhost when unable to connect to management plugin', (test, done) => {
      const vhostName = uuid();
      const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)['/']);
      customVhosts[vhostName].check = true;
      customVhosts[vhostName].connection.management.port = 65535;

      const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
      createBroker(config, (err) => {
        assert.ok(err);
        assert.ok(/Failed to check vhost: .*\. http:\/\/guest:\*\*\*@localhost:65535 errored with: .*ECONNREFUSED.*/.test(err.message), err.message);
        done();
      });
    });

    it('should succeed when checking vhosts that do exist', (test, done) => {
      const vhostName = uuid();
      const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)['/']);
      customVhosts[vhostName].assert = true;
      customVhosts[vhostName].check = true;

      const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
      createBroker(config, (err) => {
        assert.ifError(err);
        done();
      });
    });

    it('should delete vhosts', (test, done) => {
      const vhostName = uuid();
      const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)['/']);
      customVhosts[vhostName].assert = true;

      const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
      createBroker(config, (err, broker) => {
        assert.ifError(err);
        broker.nuke((err) => {
          assert.ifError(err);
          config.vhosts[vhostName].assert = false;
          config.vhosts[vhostName].check = true;
          createBroker(config, (err) => {
            assert.ok(err);
            assert.strictEqual(err.message, format('Failed to check vhost: %s. http://guest:***@localhost:15672 returned status 404', vhostName));
            done();
          });
        });
      });
    });

    it('should support custom http agent', (test, done) => {
      let requestUrl;
      const customAgent = superAgent().on('request', (req) => {
        requestUrl = req.url;
      });

      const components = { agent: customAgent };
      const vhostName = uuid();
      const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)['/']);
      customVhosts[vhostName].assert = true;

      const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
      createBroker(config, components, (err) => {
        assert.ifError(err);
        assert.ok(/api\/vhosts\/.*/.test(requestUrl), requestUrl);
        done();
      });
    });

    it('should provide fully qualified name', (test, done) => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      createBroker(config, (err, broker) => {
        assert.ifError(err);
        assert.strictEqual(namespace + ':q1', broker.getFullyQualifiedName('/', 'q1'));
        done();
      });
    });

    it('should not modify configuration', (test, done) => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      const json = JSON.stringify(config, null, 2);
      createBroker(config, (err) => {
        assert.ifError(err);
        assert.strictEqual(json, JSON.stringify(config, null, 2));
        done();
      });
    });

    it('should nuke', (test, done) => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      createBroker(config, (err, broker) => {
        assert.ifError(err);
        broker.nuke((err) => {
          assert.ifError(err);
          done();
        });
      });
    });

    it('should tolerate unsubscribe timeouts when nuking', (test, done) => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      config.vhosts['/'].subscriptions.s1.closeTimeout = 100;

      let timeoutErr;

      createBroker(config, (err, broker) => {
        assert.ifError(err);

        broker.subscribe('s1', (err, subscription) => {
          assert.ifError(err);
          subscription.on('message', () => {
            broker.nuke((err) => {
              assert.ifError(err);
              assert.strictEqual(timeoutErr.code, 'ETIMEDOUT');
              done();
            });
          });
        });

        broker.publish('p1', 'test message', (err) => {
          assert.ifError(err);
        });

        broker.on('error', (err) => {
          timeoutErr = err;
        });
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

      createBroker(config, (err, broker) => {
        assert.ifError(err);

        broker.subscribe('s1', (err, subscription) => {
          assert.ifError(err);

          subscription.on('message', () => {
            subscription.cancel((err) => {
              done(err);
            });
            assert(false, 'No message should have been received');
          });

          broker.unsubscribeAll((err) => {
            assert.ifError(err);

            broker.publish('p1', 'test message', (err) => {
              assert.ifError(err);
              setTimeout(done, 500);
            });
          });
        });
      });
    });

    it('should not return from unsubscribeAll until underlying channels have been closed', (test, done) => {
      const config = _.defaultsDeep(
        {
          vhosts,
          publications,
          subscriptions,
        },
        testConfig
      );

      config.vhosts['/'].subscriptions.s1.closeTimeout = 200;

      createBroker(config, (err, broker) => {
        assert.ifError(err);

        broker.subscribe('s1', (err, subscription) => {
          assert.ifError(err);

          broker.publish('p1', 'test message', (err) => {
            assert.ifError(err);
          });

          // eslint-disable-next-line no-empty-function
          subscription.on('message', () => {
            const before = Date.now();
            broker.unsubscribeAll((err) => {
              assert.strictEqual(err.code, 'ETIMEDOUT');
              const after = Date.now();
              assert.ok(after >= before + 200, 'Did not defer returning from unsubscibeAll');
              done();
            });
          });
        });
      });
    });

    it('should connect', (test, done) => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      createBroker(config, (err, broker) => {
        assert.ifError(err);
        broker.connect('/', (err, connection) => {
          assert.ifError(err);
          assert.ok(connection._rascal_id);
          connection.close(done);
        });
      });
    });

    it('should tolerate unsubscribe timeouts when shuting down', (test, done) => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      config.vhosts['/'].subscriptions.s1.closeTimeout = 100;

      let timeoutErr;

      createBroker(config, (err, broker) => {
        assert.ifError(err);

        broker.subscribe('s1', (err, subscription) => {
          assert.ifError(err);
          subscription.on('message', () => {
            broker.shutdown((err) => {
              assert.ifError(err);
              assert.strictEqual(timeoutErr.code, 'ETIMEDOUT');
              done();
            });
          });
        });

        broker.publish('p1', 'test message', (err) => {
          assert.ifError(err);
        });

        broker.on('error', (err) => {
          timeoutErr = err;
        });
      });
    });

    it('should bounce vhosts', (test, done) => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      createBroker(config, (err, broker) => {
        assert.ifError(err);
        broker.bounce(done);
      });
    });

    it('should tolerate unsubscribe timeouts when bouncing', (test, done) => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      config.vhosts['/'].subscriptions.s1.closeTimeout = 100;

      let timeoutErr;

      createBroker(config, (err, broker) => {
        assert.ifError(err);

        broker.subscribe('s1', (err, subscription) => {
          assert.ifError(err);
          subscription.on('message', () => {
            broker.bounce((err) => {
              assert.ifError(err);
              assert.strictEqual(timeoutErr.code, 'ETIMEDOUT');
              done();
            });
          });
        });

        broker.publish('p1', 'test message', (err) => {
          assert.ifError(err);
        });

        broker.on('error', (err) => {
          timeoutErr = err;
        });
      });
    });

    it('should purge vhosts', (test, done) => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      createBroker(config, (err, broker) => {
        assert.ifError(err);
        broker.publish('/q1', 'test message', (err) => {
          assert.ifError(err);
          setTimeout(() => {
            broker.purge((err) => {
              assert.ifError(err);
              amqputils.assertMessageAbsent('q1', namespace, done);
            });
          }, 200);
        });
      });
    });

    it(
      'should emit busy/ready events',
      (test, done) => {
        /*
    This test needs to publish messages faster than the channel can cope with in order to
    trigger a 'busy' event. It may fail on fast systems.
    */

        if (process.env.CI) return done();

        const config = _.defaultsDeep({ vhosts }, testConfig);
        createBroker(config, (err, broker) => {
          assert.ifError(err);

          let busyOn;
          let readyOn;

          const stream = random.createRandomStream().on('data', (data) => {
            broker.publish('p2', data, (err, publication) => {
              if (err) throw err;
              publication.on('error', (err) => {
                throw err;
              });
            });
          });

          broker.once('busy', () => {
            busyOn = Date.now();
            assert.strictEqual(readyOn, undefined);
            stream.pause();
          });

          broker.once('ready', () => {
            readyOn = Date.now();
            assert.ok(busyOn <= readyOn);
            done();
          });
        });
      },
      { timeout: 60000 }
    );

    it('should subscribe to all subscriptions', (test, done) => {
      const config = _.defaultsDeep(
        {
          vhosts,
          publications,
          subscriptions,
        },
        testConfig
      );

      createBroker(config, (err, broker) => {
        assert.ifError(err);
        broker.subscribeAll((err, subscriptions) => {
          assert.ifError(err);
          assert.strictEqual(subscriptions.length, 2);
          assert.strictEqual(subscriptions[0].constructor.name, 'SubscriberSession');
          assert.strictEqual(subscriptions[0].name, 's1');
          assert.strictEqual(subscriptions[1].name, '/q1');
          done();
        });
      });
    });

    it('should subscribe to all filtered subscriptions', (test, done) => {
      const config = _.defaultsDeep(
        {
          vhosts,
          publications,
          subscriptions,
        },
        testConfig
      );

      createBroker(config, (err, broker) => {
        assert.ifError(err);
        broker.subscribeAll(
          (subscriptionConfig) => {
            return !subscriptionConfig.autoCreated;
          },
          (err, subscriptions) => {
            assert.ifError(err);
            assert.strictEqual(subscriptions.length, 1);
            assert.strictEqual(subscriptions[0].constructor.name, 'SubscriberSession');
            assert.strictEqual(subscriptions[0].name, 's1');
            done();
          }
        );
      });
    });

    it('should get vhost connections', (test, done) => {
      const config = _.defaultsDeep({ vhosts }, testConfig);
      createBroker(config, (err, broker) => {
        assert.ifError(err);
        const connections = broker.getConnections();
        assert.strictEqual(connections.length, 1);
        assert.strictEqual(connections[0].vhost, '/');
        assert.strictEqual(connections[0].connectionUrl, 'amqp://guest:***@localhost:5672?heartbeat=50&connection_timeout=10000&channelMax=100', broker.getConnections()['/']);
        done();
      });
    });

    function createBroker(config, components, next) {
      if (arguments.length === 2) return createBroker(config, {}, arguments[1]);
      Broker.create(config, components, (err, _broker) => {
        broker = _broker;
        next(err, broker);
      });
    }
  },
  { timeout: 6000 }
);
