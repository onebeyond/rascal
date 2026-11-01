const assert = require('assert');
const { AsyncLocalStorage } = require('async_hooks');
const async = require('async');
const _ = require('lodash');
const amqplib = require('amqplib/callback_api');
const format = require('util').format;
const uuid = require('uuid').v4;
const testConfig = require('../lib/config/tests');
const Broker = require('..').Broker;
const Vhost = require('../lib/amqp/Vhost');
const configure = require('../lib/config/configure');
const AmqpUtils = require('./utils/amqputils');

describe('Vhost', () => {
  let broker;
  let vhost;
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
      async.series(
        [
          (cb) => (vhost ? vhost.shutdown(cb) : cb()),
          (cb) => (broker ? broker.nuke(cb) : cb()),
        ],
        (err) => {
          vhost = undefined;
          broker = undefined;
          done(err);
        },
      );
    });
  });

  it('should timeout connections', (test, done) => {
    const namespace = uuid();
    createBroker(
      {
        vhosts: {
          '/': {
            connection: {
              hostname: '10.255.255.1',
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
      },
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
      },
    );
  });

  it('should create objects concurrently', (test, done) => {
    // This test is too slow for CI
    if (process.env.CI) return done();

    function createAllTheThings(concurrency, cb) {
      const namespace = uuid();
      const exchanges = new Array(100)
        .fill()
        .map((_, index) => `e${index + 1}`)
        .reduce(
          (acc, name) => Object.assign(acc, {
            [name]: {
              assert: true,
            },
          }),
          {},
        );

      const queues = new Array(100)
        .fill()
        .map((_, index) => `q${index + 1}`)
        .reduce(
          (acc, name) => Object.assign(acc, {
            [name]: {
              assert: true,
            },
          }),
          {},
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
        },
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
  }, { timeout: 60000 });

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
      },
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
      },
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
      },
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
      },
    );
  });

  it('should reconnect on error', (test, done) => {
    createBroker({
      vhosts: {
        '/': {
          queues: ['q'],
        },
      },
    }, (err, broker) => {
      assert.ifError(err);

      broker.on('error', (err) => {
        assert.equal(err.message, 'Connection closed: 320 (CONNECTION-FORCED) with message "CONNECTION_FORCED - VHOST TEST"');
        broker.on('connect', () => done());
      });

      amqputils.waitForConnections((err, connections) => {
        amqputils.closeConnections(connections, 'VHOST TEST', (err) => {
          assert.ifError(err);
        });
      });
    });
  }, { timeout: 10000 });

  [
    { acquire: 'borrowChannel', release: 'returnChannel' },
    { acquire: 'borrowConfirmChannel', release: 'returnConfirmChannel' },
    { acquire: 'getChannel' },
    { acquire: 'getConfirmChannel' },
  ].forEach(({ acquire, release }) => {
    it(`should preserve the async context of concurrent callers of ${acquire}`, (test, done) => {
      createVhost((err, vhost) => {
        assert.ifError(err);
        const storage = new AsyncLocalStorage();
        const callers = ['caller-1', 'caller-2', 'caller-3'];
        const observed = {};

        async.each(
          callers,
          (caller, cb) => {
            storage.run(caller, () => {
              vhost[acquire]((err, channel) => {
                if (err) return cb(err);
                observed[caller] = storage.getStore();
                if (release) vhost[release](channel);
                cb();
              });
            });
          },
          (err) => {
            assert.ifError(err);
            assert.deepStrictEqual(observed, { 'caller-1': 'caller-1', 'caller-2': 'caller-2', 'caller-3': 'caller-3' });
            done();
          },
        );
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

  function createVhost(next) {
    configure(_.defaultsDeep({ vhosts: { '/': { namespace: uuid() } } }, testConfig), (err, config) => {
      if (err) return next(err);
      Vhost.create(config.vhosts['/'], {}, (err, _vhost) => {
        vhost = _vhost;
        next(err, vhost);
      });
    });
  }
}, { timeout: 2000 });
