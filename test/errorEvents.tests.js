const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const _ = require('lodash');
const amqplib = require('amqplib/callback_api');
const { randomUUID } = require('crypto');
const testConfig = require('../lib/config/tests');
const Broker = require('..').Broker;
const AmqpUtils = require('./utils/amqputils');

// amqplib wraps its frame processing in a try/catch, and turns anything thrown from it into a connection error.
// Rascal must emit error events outside of that loop, otherwise an application without an error listener gets a
// silent reconnect instead of the usual EventEmitter crash, and work in progress (e.g. nuke) is abandoned.
describe('Error events', () => {
  let broker;
  let amqputils;
  let namespace;
  let vhosts;

  beforeEach((test, done) => {
    namespace = randomUUID();
    vhosts = {
      '/': {
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
          q2: {
            assert: true,
            options: {
              arguments: {
                'x-max-length': 0,
                'x-overflow': 'reject-publish',
              },
            },
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

    amqplib.connect((err, connection) => {
      if (err) return done(err);
      amqputils = AmqpUtils.init(connection);
      done();
    });
  });

  afterEach((test, done) => {
    amqputils.disconnect(() => {
      if (!broker) return done();
      broker.nuke(done);
    });
  });

  ['nuke', 'shutdown', 'bounce'].forEach((operation) => {
    it(`should emit unsubscribe errors outside amqplib when calling ${operation}`, (test, done) => {
      createBroker(
        {
          vhosts,
          publications: {
            p1: {
              exchange: 'e1',
            },
          },
          subscriptions: {
            s1: {
              queue: 'q1',
              closeTimeout: 100,
            },
          },
        },
        (err, broker) => {
          assert.ifError(err);
          const finished = afterBoth(done);
          broker.on('error', (err) => {
            if (insideAmqplib()) return finished(new Error(`${err.message} was emitted inside amqplib`));
            assert.strictEqual(err.message, 'Callback function "waitForUnacknowledgedMessages" timed out.');
            finished();
          });
          broker.subscribe('s1', (err, subscription) => {
            assert.ifError(err);
            // Leave the message unacknowledged so that unsubscribing times out. Once, since bounce resubscribes.
            subscription.once('message', () => {
              broker[operation](finished);
            });
            broker.publish('p1', 'test message', assert.ifError);
          });
        },
      );
    });
  });

  it('should emit consumer cancellation errors outside amqplib', (test, done) => {
    createBroker(
      {
        vhosts,
        subscriptions: {
          s1: {
            queue: 'q1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.subscribe('s1', (err, subscription) => {
          assert.ifError(err);
          subscription.on('message', () => {
            assert.ok(false, 'No messages expected');
          });
          subscription.on('error', (err) => {
            if (insideAmqplib()) return done(new Error(`${err.message} was emitted inside amqplib`));
            assert.strictEqual(err.message, 'Subscription: s1 was cancelled by the broker');
            subscription.cancel(done);
          });
          subscription.on('subscribed', () => {
            amqputils.deleteQueue('q1', namespace, assert.ifError);
          });
        });
      },
    );
  });

  it('should emit acknowledgement errors outside amqplib', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
          },
        },
        subscriptions: {
          s1: {
            queue: 'q1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.subscribe('s1', (err, subscription) => {
          assert.ifError(err);
          subscription.on('message', (message, content, ackOrNack) => {
            ackOrNack();
            ackOrNack();
          });
          subscription.on('error', (err) => {
            if (insideAmqplib()) return done(new Error(`${err.message} was emitted inside amqplib`));
            assert.strictEqual(err.message, 'ackOrNack should only be called once per message');
            subscription.cancel(done);
          });
          broker.publish('p1', 'test message', assert.ifError);
        });
      },
    );
  });

  it('should emit subscription errors outside amqplib', (test, done) => {
    createBroker(
      {
        vhosts,
        subscriptions: {
          s1: {
            queue: 'q1',
            retry: false,
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        amqputils.deleteQueue('q1', namespace, (err) => {
          assert.ifError(err);
          broker.subscribe('s1', (err, subscription) => {
            assert.ifError(err);
            subscription.on('message', () => {
              assert.ok(false, 'No messages expected');
            });
            subscription.once('error', (err) => {
              if (insideAmqplib()) return done(new Error(`${err.message} was emitted inside amqplib`));
              assert.match(err.message, /NOT_FOUND/);
              done();
            });
          });
        });
      },
    );
  });

  it('should emit publication errors outside amqplib', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            queue: 'q2',
            confirm: true,
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', 'test message', (err, publication) => {
          assert.ifError(err);
          publication.on('success', () => {
            done(new Error('Expected the broker to nack the message'));
          });
          publication.on('error', (err) => {
            if (insideAmqplib()) return done(new Error(`${err.message} was emitted inside amqplib`));
            assert.match(err.message, /nack/i);
            done();
          });
        });
      },
    );
  });

  function insideAmqplib() {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = Infinity;
    const { stack } = new Error();
    Error.stackTraceLimit = limit;
    return /amqplib[\\/]lib[\\/]connection\.js/.test(stack);
  }

  // Calls done once both the error event and the operation have completed, or straight away on failure
  function afterBoth(done) {
    let count = 0;
    let failed = false;
    return (err) => {
      if (failed) return;
      if (err) {
        failed = true;
        return done(err);
      }
      if (++count === 2) done();
    };
  }

  function createBroker(config, next) {
    config = _.defaultsDeep(config, testConfig);
    Broker.create(config, (err, _broker) => {
      broker = _broker;
      next(err, broker);
    });
  }
});
