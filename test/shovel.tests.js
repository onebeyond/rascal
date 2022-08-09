const assert = require('assert');
const _ = require('lodash');
const uuid = require('uuid').v4;
const testConfig = require('../lib/config/tests');
const Broker = require('..').Broker;

describe('Shovel', () => {
  let broker;
  let namespace;
  let config;

  beforeEach((test, done) => {
    namespace = uuid();
    config = {
      vhosts: {
        '/': {
          namespace,
          exchanges: {
            e1: {
              assert: true,
            },
            e2: {
              assert: true,
            },
          },
          queues: {
            q1: {
              assert: true,
            },
            q2: {
              assert: true,
            },
          },
          bindings: {
            b1: {
              source: 'e1',
              destination: 'q1',
              bindingKey: 'foo',
            },
            b2: {
              source: 'e2',
              destination: 'q2',
              bindingKey: 'bar',
            },
          },
        },
      },
      publications: {
        p1: {
          exchange: 'e1',
          routingKey: 'foo',
        },
        p2: {
          exchange: 'e2',
          routingKey: 'bar',
        },
      },
      subscriptions: {
        s1: {
          queue: 'q1',
        },
        s2: {
          queue: 'q2',
          options: {
            noAck: true,
          },
        },
      },
      shovels: {
        x1: {
          subscription: 's1',
          publication: 'p2',
        },
      },
    };
    done();
  });

  afterEach((test, done) => {
    if (!broker) return done();
    broker.nuke(done);
  });

  it('should transfer message from subscriber to publication', (test, done) => {
    createBroker(config, (err, broker) => {
      assert.ifError(err);
      broker.publish('p1', 'Test Message', assert.ifError);
      broker.subscribe('s2', (err, subscription) => {
        assert.ifError(err);
        subscription.on('message', () => {
          done();
        });
      });
    });
  });

  function createBroker(config, next) {
    config = _.defaultsDeep(config, testConfig);
    Broker.create(config, (err, _broker) => {
      broker = _broker;
      next(err, broker);
    });
  }
});
