var assert = require('assert');
var _ = require('lodash');
var testConfig = require('../lib/config/tests');
var uuid = require('uuid').v4;
var format = require('util').format;
var Broker = require('..').Broker;


describe('Broker', function() {

  this.timeout(6000);
  this.slow(1000);

  var broker;
  var namespace;
  var vhosts;
  var publications;
  var subscriptions;

  beforeEach(function(done) {

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

    done();
  });

  afterEach(function(done) {
    if (broker) return broker.nuke(done);
    done();
  });

  it('should assert vhosts', function(done) {
    var vhostName = uuid();
    var customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].assert = true;

    var config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      done();
    });
  });

  it('should fail to assert vhost when unable to connect to management plugin', function(done) {
    var vhostName = uuid();
    var customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].assert = true;
    customVhosts[vhostName].connection.management.port = 65535;

    var config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ok(err);
      assert.ok(/Failed to assert vhost: .*\. http:\/\/guest:\*\*\*@localhost:65535 errored with: .*ECONNREFUSED.*/.test(err.message), err.message);
      done();
    });
  });

  it('should fail when checking vhosts that dont exist', function(done) {
    var vhostName = uuid();
    var customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].check = true;

    var config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ok(err);
      assert.equal(err.message, format('Failed to check vhost: %s. http://guest:***@localhost:15672 returned status 404', vhostName));
      done();
    });
  });

  it('should fail to check vhost when unable to connect to management plugin', function(done) {
    var vhostName = uuid();
    var customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].check = true;
    customVhosts[vhostName].connection.management.port = 65535;

    var config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ok(err);
      assert.ok(/Failed to check vhost: .*\. http:\/\/guest:\*\*\*@localhost:65535 errored with: .*ECONNREFUSED.*/.test(err.message), err.message);
      done();
    });
  });

  it('should succeed when checking vhosts that do exist', function(done) {
    var vhostName = uuid();
    var customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].assert = true;
    customVhosts[vhostName].check = true;

    var config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      done();
    });
  });

  it('should delete vhosts', function(done) {
    var vhostName = uuid();
    var customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].assert = true;

    var config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      broker.nuke(function(err) {
        assert.ifError(err);
        config.vhosts[vhostName].assert = false;
        config.vhosts[vhostName].check = true;
        createBroker(config, function(err, broker) {
          assert.ok(err);
          assert.equal(err.message, format('Failed to check vhost: %s. http://guest:***@localhost:15672 returned status 404', vhostName));
          done();
        });
      });
    });
  });

  it('should provide fully qualified name', function(done) {
    var config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      assert.equal(namespace + ':q1', broker.getFullyQualifiedName('/', 'q1'));
      done();
    });
  });

  it('should not modify configuration', function(done) {
    var config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    var json = JSON.stringify(config, null, 2);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      assert.equal(json, JSON.stringify(config, null, 2));
      done();
    });
  });

  it('should nuke', function(done) {
    var config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      broker.nuke(function(err) {
        assert.ifError(err);
        done();
      });
    });
  });

  it('should cancel subscriptions', function(done) {
    var config = _.defaultsDeep({
      vhosts: vhosts, publications: publications,
      subscriptions: subscriptions,
    }, testConfig);

    createBroker(config, function(err, broker) {
      assert.ifError(err);

      broker.subscribe('s1', function(err, subscription) {
        assert.ifError(err);

        subscription.on('message', function(message, content, ackOrNack) {
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

  it('should connect', function(done) {
    var config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    createBroker(config, function(err, broker) {
      assert.ifError(err);
      broker.connect('/', function(err, connection) {
        assert.ifError(err);
        assert.ok(connection._rascal_id);
        done();
      });
    });
  });

  function createBroker(config, next) {
    Broker.create(config, function(err, _broker) {
      broker = _broker;
      next(err, broker);
    });
  }
});
