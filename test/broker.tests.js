const assert = require('assert');
const _ = require('lodash');
const testConfig = require('../lib/config/tests');
const uuid = require('uuid').v4;
const format = require('util').format;
const Broker = require('..').Broker;
const amqplib = require('amqplib/callback_api');
const AmqpUtils = require('./utils/amqputils');
const random = require('random-readable');

describe('Broker', function() {

  let broker;
  let amqputils;
  let namespace;
  let vhosts;
  let publications;
  let subscriptions;

  beforeEach(function(test, done) {

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
        namespace: namespace,
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

    amqplib.connect(function(err, connection) {
      if (err) return done(err);
      amqputils = AmqpUtils.init(connection);
      done();
    });
  });

  afterEach(function(test, done) {
    amqputils.disconnect(function() {
      if (broker) return broker.nuke(done);
      done();
    });
  });

  it('should assert vhosts', function(test, done) {
    const vhostName = uuid();
    const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].assert = true;

    const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    createBroker(config, function(err) {
      assert.ifError(err);
      done();
    });
  });

  it('should fail to assert vhost when unable to connect to management plugin', function(test, done) {
    const vhostName = uuid();
    const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].assert = true;
    customVhosts[vhostName].connection.management.port = 65535;

    const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    createBroker(config, function(err) {
      assert.ok(err);
      assert.ok(/Failed to assert vhost: .*\. http:\/\/guest:\*\*\*@localhost:65535 errored with: .*ECONNREFUSED.*/.test(err.message), err.message);
      done();
    });
  });

  it('should fail when checking vhosts that dont exist', function(test, done) {
    const vhostName = uuid();
    const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].check = true;

    const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    createBroker(config, function(err) {
      assert.ok(err);
      assert.equal(err.message, format('Failed to check vhost: %s. http://guest:***@localhost:15672 returned status 404', vhostName));
      done();
    });
  });

  it('should fail to check vhost when unable to connect to management plugin', function(test, done) {
    const vhostName = uuid();
    const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].check = true;
    customVhosts[vhostName].connection.management.port = 65535;

    const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    createBroker(config, function(err) {
      assert.ok(err);
      assert.ok(/Failed to check vhost: .*\. http:\/\/guest:\*\*\*@localhost:65535 errored with: .*ECONNREFUSED.*/.test(err.message), err.message);
      done();
    });
  });

  it('should succeed when checking vhosts that do exist', function(test, done) {
    const vhostName = uuid();
    const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].assert = true;
    customVhosts[vhostName].check = true;

    const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    createBroker(config, function(err) {
      assert.ifError(err);
      done();
    });
  });

  it('should delete vhosts', function(test, done) {
    const vhostName = uuid();
    const customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].assert = true;

    const config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      broker.nuke(function(err) {
        assert.ifError(err);
        config.vhosts[vhostName].assert = false;
        config.vhosts[vhostName].check = true;
        createBroker(config, function(err) {
          assert.ok(err);
          assert.equal(err.message, format('Failed to check vhost: %s. http://guest:***@localhost:15672 returned status 404', vhostName));
          done();
        });
      });
    });
  });

  it('should provide fully qualified name', function(test, done) {
    const config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      assert.equal(namespace + ':q1', broker.getFullyQualifiedName('/', 'q1'));
      done();
    });
  });

  it('should not modify configuration', function(test, done) {
    const config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    const json = JSON.stringify(config, null, 2);
    createBroker(config, function(err) {
      assert.ifError(err);
      assert.equal(json, JSON.stringify(config, null, 2));
      done();
    });
  });

  it('should nuke', function(test, done) {
    const config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      broker.nuke(function(err) {
        assert.ifError(err);
        done();
      });
    });
  });

  it('should cancel subscriptions', function(test, done) {
    const config = _.defaultsDeep({
      vhosts: vhosts, publications: publications,
      subscriptions: subscriptions,
    }, testConfig);

    createBroker(config, function(err, broker) {
      assert.ifError(err);

      broker.subscribe('s1', function(err, subscription) {
        assert.ifError(err);

        subscription.on('message', function() {
          subscription.cancel(function(err) {
            done(err);
          });
          assert(false, 'No message should have been received');
        });

        broker.unsubscribeAll(function(err) {
          assert.ifError(err);

          broker.publish('p1', 'test message', function(err) {
            assert.ifError(err);
            setTimeout(done, 500);
          });
        });
      });
    });
  });

  it('should defer returning from unsubscribeAll until underlying channels have been closed', function(test, done) {
    const config = _.defaultsDeep({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }, testConfig);

    config.vhosts['/'].subscriptions.s1.deferCloseChannel = 200;

    createBroker(config, function(err, broker) {
      assert.ifError(err);

      broker.subscribe('s1', function(err, subscription) {
        assert.ifError(err);

        // eslint-disable-next-line no-empty-function
        subscription.on('message', function() {
        });

        const before = Date.now();
        broker.unsubscribeAll(function(err) {
          assert.ifError(err);
          const after = Date.now();
          assert.ok(after >= (before + 200), 'Did not defer returning from unsubscibeAll');
          done();
        });
      });
    });
  });

  it('should connect', function(test, done) {
    const config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      broker.connect('/', function(err, connection) {
        assert.ifError(err);
        assert.ok(connection._rascal_id);
        connection.close(done);
      });
    });
  });

  it('should bounce vhosts', function(test, done) {
    const config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      broker.bounce(done);
    });
  });

  it('should purge vhosts', function(test, done) {
    const config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      broker.publish('/q1', 'test message', function(err) {
        assert.ifError(err);
        setTimeout(function() {
          broker.purge(function(err) {
            assert.ifError(err);
            amqputils.assertMessageAbsent('q1', namespace, done);
          });
        }, 200);
      });
    });
  });

  it('should emit busy/ready events', function(test, done) {
    /*
    This test needs to publish messages faster than the channel can cope with in order to
    trigger a 'busy' event. It may fail on fast systems.
    */

    if (process.env.CI) return done();

    const config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);

      let busyOn;
      let readyOn;

      const stream = random.createRandomStream()
        .on('data', data => {
          broker.publish('p2', data, function(err, publication) {
            if (err) throw err;
            publication.on('error', console.error);
          });
        });

      broker.once('busy', function() {
        busyOn = Date.now();
        assert.equal(readyOn, undefined);
        stream.pause();
      });

      broker.once('ready', function() {
        readyOn = Date.now();
        assert.ok(busyOn <= readyOn);
        done();
      });
    });
  }, { timeout: 60000 });

  it('should subscribe to all subscriptions', function(test, done) {
    const config = _.defaultsDeep({
      vhosts: vhosts, publications: publications,
      subscriptions: subscriptions,
    }, testConfig);

    createBroker(config, function(err, broker) {
      assert.ifError(err);
      broker.subscribeAll(function(err, subscriptions) {
        assert.ifError(err);
        assert.equal(subscriptions.length, 2);
        assert.equal(subscriptions[0].constructor.name, 'SubscriberSession');
        assert.equal(subscriptions[0].name, 's1');
        assert.equal(subscriptions[1].name, '/q1');
        done();
      });
    });
  });

  it('should subscribe to all filtered subscriptions', function(test, done) {
    const config = _.defaultsDeep({
      vhosts: vhosts, publications: publications,
      subscriptions: subscriptions,
    }, testConfig);

    createBroker(config, function(err, broker) {
      assert.ifError(err);
      broker.subscribeAll(function(subscriptionConfig) {
        return !subscriptionConfig.autoCreated;
      }, function(err, subscriptions) {
        assert.ifError(err);
        assert.equal(subscriptions.length, 1);
        assert.equal(subscriptions[0].constructor.name, 'SubscriberSession');
        assert.equal(subscriptions[0].name, 's1');
        done();
      });
    });
  });

  it('should get vhost connections', function(test, done) {
    const config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      const connections = broker.getConnections();
      assert.equal(connections.length, 1);
      assert.equal(connections[0].vhost, '/');
      assert.equal(connections[0].connectionUrl, 'amqp://guest:***@localhost:5672?heartbeat=50&connection_timeout=10000&channelMax=100', broker.getConnections()['/']);
      done();
    });
  });

  function createBroker(config, next) {
    Broker.create(config, function(err, _broker) {
      broker = _broker;
      next(err, broker);
    });
  }
}, { timeout: 6000 });
