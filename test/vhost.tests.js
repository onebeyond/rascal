const assert = require("assert");
const _ = require("lodash");
const amqplib = require("amqplib/callback_api");
const testConfig = require("../lib/config/tests");
const format = require("util").format;
const uuid = require("uuid").v4;
const Broker = require("..").Broker;
const AmqpUtils = require("./utils/amqputils");

describe(
  "Vhost",
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

    it("should timeout connections", (test, done) => {
      const namespace = uuid();
      createBroker(
        {
          vhosts: {
            "/": {
              connection: {
                host: "10.255.255.1",
                socketOptions: {
                  timeout: 100,
                },
              },
              namespace,
            },
          },
        },
        (err) => {
          assert.ok(err.message.match("connect ETIMEDOUT"));
          done();
        }
      );
    });

    it("should create exchanges", (test, done) => {
      const namespace = uuid();
      createBroker(
        {
          vhosts: {
            "/": {
              namespace,
              exchanges: {
                e1: {
                  assert: true,
                },
              },
            },
          },
        },
        () => {
          amqputils.assertExchangePresent("e1", namespace, done);
        }
      );
    });

    it("should create queues", (test, done) => {
      const namespace = uuid();
      createBroker(
        {
          vhosts: {
            "/": {
              namespace,
              queues: {
                q1: {
                  assert: true,
                },
              },
            },
          },
        },
        () => {
          amqputils.assertQueuePresent("q1", namespace, done);
        }
      );
    });

    it("should fail when checking a missing exchange", (test, done) => {
      createBroker(
        {
          vhosts: {
            "/": {
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
          assert.ok(
            /NOT-FOUND/.test(err.message),
            format("%s did not match the expected format", err.message)
          );
          done();
        }
      );
    });

    it("should fail when checking a missing queue", (test, done) => {
      createBroker(
        {
          vhosts: {
            "/": {
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
          assert.ok(
            /NOT-FOUND/.test(err.message),
            format("%s did not match the expected format", err.message)
          );
          done();
        }
      );
    });

    it("should create bindings", (test, done) => {
      const namespace = uuid();

      createBroker(
        {
          vhosts: {
            "/": {
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
                  source: "e1",
                  destination: "e2",
                  destinationType: "exchange",
                },
                b2: {
                  source: "e1",
                  destination: "q1",
                },
              },
            },
          },
        },
        (err) => {
          assert.ifError(err);
          amqputils.publishMessage(
            "e1",
            namespace,
            "test message",
            {},
            (err) => {
              assert.ifError(err);
              amqputils.assertMessage("q1", namespace, "test message", done);
            }
          );
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
