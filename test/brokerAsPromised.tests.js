var assert = require('assert');
var _ = require('lodash');
var testConfig = require('../lib/config/tests');
var uuid = require('uuid').v4;
var format = require('util').format;
var BrokerAsPromised = require('..').BrokerAsPromised;


describe('Broker As Promised', function() {

  this.timeout(2000);
  this.slow(1000);

  var broker;
  var namespace;
  var vhosts;
  var publications;
  var subscriptions;

  beforeEach(function() {

    namespace = uuid();

    vhosts = {
      '/': {
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
  });

  afterEach(function() {
    if (broker) return broker.nuke();
  });

  it('should assert vhosts', function() {
    var vhostName = uuid();
    var customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].assert = true;

    var config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    return createBroker(config);
  });

  it('should fail when checking vhosts that dont exist', function() {
    var vhostName = uuid();
    var customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].check = true;

    var config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    return createBroker(config).catch(function(err) {
      assert.ok(err);
      assert.equal(err.message, format('Failed to check vhost: %s. http://guest:***@localhost:15672 returned status 404', vhostName));
    });
  });

  it('should not fail when checking vhosts that do exist', function() {
    var vhostName = uuid();
    var customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].assert = true;
    customVhosts[vhostName].check = true;

    var config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    return createBroker(config);
  });

  it('should delete vhosts', function() {
    var vhostName = uuid();
    var customVhosts = _.set({}, vhostName, _.cloneDeep(vhosts)["/"]);
    customVhosts[vhostName].assert = true;

    var config = _.defaultsDeep({ vhosts: customVhosts }, testConfig);
    return createBroker(config).then(function(broker) {
      return broker.nuke().then(function() {
        config.vhosts[vhostName].assert = false;
        config.vhosts[vhostName].check = true;
        return createBroker(config).catch(function(err) {
          assert.ok(err);
          assert.equal(err.message, format('Failed to check vhost: %s. http://guest:***@localhost:15672 returned status 404', vhostName));
        });
      });
    });
  });

  it('should provide fully qualified name', function() {
    var config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    return createBroker(config).then(function(broker) {
      assert.equal(namespace + ':q1', broker.getFullyQualifiedName('/', 'q1'));
    });
  });

  it('should not modify configuration', function() {
    var config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    var json = JSON.stringify(config, null, 2);
    return createBroker(config).then(function(broker) {
      assert.equal(json, JSON.stringify(config, null, 2));
    });
  });

  it('should nuke', function() {
    var config = _.defaultsDeep({ vhosts: vhosts }, testConfig);
    return createBroker(config).then(function(broker) {
      return broker.nuke();
    });
  });

  it('should cancel subscriptions', function(done) {
    var config = _.defaultsDeep({
      vhosts: vhosts, publications: publications,
      subscriptions: subscriptions,
    }, testConfig);

    createBroker(config).then(function(broker) {

      broker.subscribe('s1').then(function(subscription) {

        subscription.on('message', function(message, content, ackOrNack) {
          assert(false, 'No message should have been received');
        });

        broker.unsubscribeAll().then(function() {
          broker.publish('p1', 'test message').then(function() {
            setTimeout(done, 500);
          });
        });
      });
    });
  });

  function createBroker(config) {
    return BrokerAsPromised.create(config).then(function(_broker) {
      broker = _broker;
      return broker;
    });
  }
});
