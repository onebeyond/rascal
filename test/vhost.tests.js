const assert = require('assert');
const async = require('async');
const _ = require('lodash');
const amqplib = require('amqplib/callback_api');
const format = require('util').format;
const uuid = require('uuid').v4;
const testConfig = require('../lib/config/tests');
const Broker = require('..').Broker;
const AmqpUtils = require('./utils/amqputils');

describe(
  'Vhost',
  () => {
    let broker;
    let amqputils;

    beforeEach((test, done) => {
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

    it('should timeout connections', (test, done) => {
      const namespace = uuid();
      createBroker(
        {
          vhosts: {
            '/': {
              connection: {
                host: '10.255.255.1',
                socketOptions: {
                  timeout: 100,
                },
              },
              namespace,
            },
          },
        },
        (err) => {
          assert.ok(err.message.match('connect ETIMEDOUT'));
          done();
        }
      );
    });

    it('should create exchanges', (test, done) => {
      const namespace = uuid();
      createBroker(
        {
          vhosts: {
            '/': {
              namespace,
              exchanges: {
                e1: {
                  assert: true,
                },
              },
            },
          },
        },
        (err) => {
          assert.ifError(err);
          amqputils.assertExchangePresent('e1', namespace, done);
        }
      );
    });

    it(
      'should create objects concurrently',
      (test, done) => {
        function createAllTheThings(concurrency, cb) {
          const namespace = uuid();
          const exchanges = new Array(100)
            .fill()
            .map((_, index) => `e${index + 1}`)
            .reduce(
              (acc, name) =>
                Object.assign(acc, {
                  [name]: {
                    assert: true,
                  },
                }),
              {}
            );

          const queues = new Array(100)
            .fill()
            .map((_, index) => `q${index + 1}`)
            .reduce(
              (acc, name) =>
                Object.assign(acc, {
                  [name]: {
                    assert: true,
                  },
                }),
              {}
            );

          const bindings = new Array(100).fill().map((_, index) => `e${index + 1}[a.b.c] -> q${index + 1}`);

          const before = Date.now();
          createBroker(
            {
              vhosts: {
                '/': {
                  concurrency,
                  namespace,
                  exchanges,
                  queues,
                  bindings,
                },
              },
            },
            (err) => {
              assert.ifError(err);
              const after = Date.now();
              amqputils.assertExchangePresent('e100', namespace, (err) => {
                if (err) return cb(err);
                broker.nuke((err) => {
                  cb(err, after - before);
                });
              });
            }
          );
        }

        const reps = 5;
        const serialTest = (n, cb) => createAllTheThings(1, cb);
        const concurrentTest = (n, cb) => createAllTheThings(10, cb);
        async.series([(cb) => async.timesSeries(reps, serialTest, cb), (cb) => async.timesSeries(reps, concurrentTest, cb)], (err, results) => {
          if (err) return done(err);
          const [a, b] = results;
          const averageA = a.reduce((a, b) => a + b, 0) / reps;
          const averageB = b.reduce((a, b) => a + b, 0) / reps;
          assert.ok(averageB < averageA / 2);
          return done();
        });
      },
      { timeout: 120000 }
    );

    it('should create queues', (test, done) => {
      const namespace = uuid();
      createBroker(
        {
          vhosts: {
            '/': {
              namespace,
              queues: {
                q1: {
                  assert: true,
                },
              },
            },
          },
        },
        (err) => {
          assert.ifError(err);
          amqputils.assertQueuePresent('q1', namespace, done);
        }
      );
    });

    it('should fail when checking a missing exchange', (test, done) => {
      createBroker(
        {
          vhosts: {
            '/': {
              exchanges: {
                e1: {
                  assert: false,
                  check: true,
                },
              },
            },
          },
        },
        (err) => {
          assert.ok(err);
          assert.ok(/NOT-FOUND/.test(err.message), format('%s did not match the expected format', err.message));
          done();
        }
      );
    });

    it('should fail when checking a missing queue', (test, done) => {
      createBroker(
        {
          vhosts: {
            '/': {
              queues: {
                q1: {
                  assert: false,
                  check: true,
                },
              },
            },
          },
        },
        (err) => {
          assert.ok(err);
          assert.ok(/NOT-FOUND/.test(err.message), format('%s did not match the expected format', err.message));
          done();
        }
      );
    });

    it('should create bindings', (test, done) => {
      const namespace = uuid();

      createBroker(
        {
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
              },
              bindings: {
                b1: {
                  source: 'e1',
                  destination: 'e2',
                  destinationType: 'exchange',
                },
                b2: {
                  source: 'e1',
                  destination: 'q1',
                },
              },
            },
          },
        },
        (err) => {
          assert.ifError(err);
          amqputils.publishMessage('e1', namespace, 'test message', {}, (err) => {
            assert.ifError(err);
            amqputils.assertMessage('q1', namespace, 'test message', done);
          });
        }
      );
    });

    function createBroker(config, next) {
      config = _.defaultsDeep(config, testConfig);
      Broker.create(config, (err, _broker) => {
        broker = _broker;
        next(err, broker);
      });
    }
  },
  { timeout: 2000 }
);
