const assert = require('assert');
const _ = require('lodash');
const async = require('async');
const amqplib = require('amqplib/callback_api');
const format = require('util').format;
const uuid = require('uuid').v4;
const testConfig = require('../lib/config/tests');
const Broker = require('..').Broker;
const AmqpUtils = require('./utils/amqputils');

describe('Publications', () => {
  let broker;
  let amqputils;
  let namespace;
  let vhosts;

  beforeEach((test, done) => {
    namespace = uuid();

    vhosts = {
      '/': {
        namespace,
        exchanges: {
          e1: {
            assert: true,
          },
          e2: {
            assert: true,
          },
          xx: {
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
          q3: {
            assert: true,
          },
        },
        bindings: {
          b1: {
            source: 'e1',
            destination: 'q1',
          },
          b2: {
            source: 'e2',
            destination: 'q2',
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
      if (broker) return broker.nuke(done);
      done();
    });
  });

  it('should report unknown publications', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('does-not-exist', 'test message', (err) => {
          assert.ok(err);
          assert.strictEqual(err.message, 'Unknown publication: does-not-exist');
          done();
        });
      },
    );
  });

  it('should report deprecated publications', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
            deprecated: true,
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', 'test message', (err, publication) => {
          assert.ifError(err);
          publication.on('success', () => {
            amqputils.assertMessage('q1', namespace, 'test message', done);
          });
        });
      },
    );
  });

  it('should publish text messages to normal exchanges', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
            confirm: false,
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', 'test message', (err, publication) => {
          assert.ifError(err);
          publication.on('success', () => {
            amqputils.assertMessage('q1', namespace, 'test message', done);
          });
        });
      },
    );
  });

  it('should publish text messages using confirm channels to exchanges', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
            confirm: true,
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', 'test message', (err, publication) => {
          assert.ifError(err);
          publication.on('success', () => {
            amqputils.assertMessage('q1', namespace, 'test message', done);
          });
        });
      },
    );
  });

  it('should publish text messages to queues', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            queue: 'q1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', 'test message', (err, publication) => {
          assert.ifError(err);
          publication.on('success', () => {
            amqputils.assertMessage('q1', namespace, 'test message', done);
          });
        });
      },
    );
  });

  it('should publish text messages to queues via the default exchange', (test, done) => {
    createBroker(
      {
        vhosts,
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('/', 'test message', broker.qualify('/', 'q3'), (err, publication) => {
          assert.ifError(err);
          publication.on('success', () => {
            amqputils.assertMessage('q3', namespace, 'test message', done);
          });
        });
      },
    );
  });

  it('should decorate the message with a uuid', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', 'test message', (err, publication) => {
          assert.ifError(err);
          publication.on('success', (messageId) => {
            assert.ok(/\w+-\w+-\w+-\w+-\w+/.test(messageId), format('%s failed to match expected pattern', messageId));

            amqputils.getMessage('q1', namespace, (err, message) => {
              assert.ifError(err);
              assert.ok(message);
              assert.strictEqual(messageId, message.properties.messageId);
              done();
            });
          });
        });
      },
    );
  });

  it('should honour messageId when specified', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', 'test message', { options: { messageId: 'wibble' } }, (err, publication) => {
          assert.ifError(err);
          publication.on('success', (messageId) => {
            assert.strictEqual('wibble', messageId);

            amqputils.getMessage('q1', namespace, (err, message) => {
              assert.ifError(err);
              assert.ok(message);
              assert.strictEqual('wibble', message.properties.messageId);
              done();
            });
          });
        });
      },
    );
  });

  it('should decorate error events with messageId', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', 'test message', { options: { messageId: 'wibble' } }, (err, publication) => {
          assert.ifError(err);
          publication.on('success', (messageId) => {
            assert.strictEqual('wibble', messageId);

            amqputils.getMessage('q1', namespace, (err, message) => {
              assert.ifError(err);
              assert.ok(message);
              assert.strictEqual('wibble', message.properties.messageId);
              done();
            });
          });
          publication.on('error', (messageId) => {
            assert.strictEqual('wibble', messageId);

            amqputils.getMessage('q1', namespace, (err, message) => {
              assert.ifError(err);
              assert.ok(message);
              assert.strictEqual('wibble', message.properties.messageId);
              done();
            });
          });
        });
      },
    );
  });

  it('should publish to using confirm channels to queues', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            queue: 'q1',
            confirm: true,
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', 'test message', (err, publication) => {
          assert.ifError(err);
          publication.on('success', () => {
            amqputils.assertMessage('q1', namespace, 'test message', done);
          });
        });
      },
    );
  });

  it('should publish json messages to normal exchanges', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', { message: 'test message' }, (err, publication) => {
          assert.ifError(err);
          publication.on('success', () => {
            amqputils.assertMessage('q1', namespace, JSON.stringify({ message: 'test message' }), done);
          });
        });
      },
    );
  });

  it('should publish messages with custom contentType to normal exchanges', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish(
          'p1',
          { message: 'test message' },
          {
            options: { contentType: 'application/vnd+custom.contentType.v1' },
          },
          (err, publication) => {
            assert.ifError(err);
            publication.on('success', () => {
              amqputils.getMessage('q1', namespace, (err, message) => {
                assert.ifError(err);
                assert.ok(message, 'Message was not present');
                assert.strictEqual(message.properties.contentType, 'application/vnd+custom.contentType.v1');
                assert.strictEqual(message.content.toString(), JSON.stringify({ message: 'test message' }));
                done();
              });
            });
          },
        );
      },
    );
  });

  it('should publish buffer messages to normal exchanges', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', Buffer.from('test message'), (err, publication) => {
          assert.ifError(err);
          publication.on('success', () => {
            amqputils.assertMessage('q1', namespace, 'test message', done);
          });
        });
      },
    );
  });

  it('should allow publish overrides', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            queue: 'q1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', 'test message', { options: { expiration: 1 } }, (err, publication) => {
          assert.ifError(err);
          publication.on('success', () => {
            setTimeout(() => {
              amqputils.assertMessageAbsent('q1', namespace, done);
            }, 100);
          });
        });
      },
    );
  });

  it('should report unrouted messages', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'xx',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', 'test message', { options: { expiration: 1 } }, (err, publication) => {
          assert.ifError(err);
          publication.on('return', (message) => {
            assert.ok(message);
            done();
          });
        });
      },
    );
  });

  it('should forward messages to publications', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
            routingKey: 'rk1',
          },
          p2: {
            exchange: 'e2',
            routingKey: 'rk2',
          },
        },
        subscriptions: {
          s1: {
            vhost: '/',
            queue: 'q1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);

        let messageId;

        broker.subscribe('s1', (err, subscription) => {
          assert.ifError(err);

          subscription.on('message', (message, content, ackOrNack) => {
            broker.forward('p2', message, (err, publication) => {
              assert.ifError(err);
              publication.on('success', () => {
                ackOrNack();

                amqputils.getMessage('q2', namespace, (err, message) => {
                  assert.ifError(err);
                  assert.ok(message);
                  assert.strictEqual(message.fields.routingKey, 'rk2');
                  assert.strictEqual(message.properties.messageId, messageId);
                  assert.strictEqual(message.properties.contentType, 'text/plain');
                  assert.strictEqual(message.content.toString(), 'test message');
                  assert.ok(/\w+-\w+-\w+-\w+-\w+:q1/.test(message.properties.headers.rascal.originalQueue), format('%s failed to match expected pattern', message.properties.headers.rascal.originalQueue));
                  assert.strictEqual(message.properties.headers.rascal.restoreRoutingHeaders, false);
                  assert.strictEqual(message.properties.headers.rascal.originalRoutingKey, 'rk1');
                  assert.strictEqual(message.properties.headers.rascal.originalExchange, `${namespace}:e1`);
                  done();
                });
              });
            });
          });
        });

        broker.publish('p1', 'test message', (err, publication) => {
          assert.ifError(err);
          publication.on('success', (_messageId) => {
            messageId = _messageId;
          });
        });
      },
    );
  });

  it('should instruct subscriber to restore routing headers when requested', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
            routingKey: 'rk1',
          },
          p2: {
            exchange: 'e2',
            routingKey: 'rk2',
          },
        },
        subscriptions: {
          s1: {
            vhost: '/',
            queue: 'q1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);

        broker.subscribe('s1', (err, subscription) => {
          assert.ifError(err);

          subscription.on('message', (message, content, ackOrNack) => {
            broker.forward('p2', message, { restoreRoutingHeaders: true }, (err, publication) => {
              assert.ifError(err);
              publication.on('success', () => {
                ackOrNack();

                amqputils.getMessage('q2', namespace, (err, message) => {
                  assert.ifError(err);
                  assert.ok(message);
                  assert.strictEqual(message.properties.headers.rascal.restoreRoutingHeaders, true);
                  done();
                });
              });
            });
          });
        });

        broker.publish('p1', 'test message', (err) => {
          assert.ifError(err);
        });
      },
    );
  });

  it('should forward messages to publications maintaining the original routing key when not overriden', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
            routingKey: 'rk1',
          },
          p2: {
            exchange: 'e2',
          },
        },
        subscriptions: {
          s1: {
            vhost: '/',
            queue: 'q1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);

        broker.subscribe('s1', (err, subscription) => {
          assert.ifError(err);

          subscription.on('message', (message, content, ackOrNack) => {
            broker.forward('p2', message, (err, publication) => {
              assert.ifError(err);
              publication.on('success', () => {
                ackOrNack();

                amqputils.getMessage('q2', namespace, (err, message) => {
                  assert.ifError(err);
                  assert.ok(message);
                  assert.strictEqual(message.fields.routingKey, 'rk1');
                  done();
                });
              });
            });
          });
        });

        broker.publish('p1', 'test message', (err) => {
          assert.ifError(err);
        });
      },
    );
  });

  it(
    'should publish lots of messages using normal channels',
    (test, done) => {
      createBroker(
        {
          vhosts,
          publications: {
            p1: {
              queue: 'q1',
              confirm: false,
            },
          },
        },
        (err, broker) => {
          assert.ifError(err);

          async.timesSeries(
            1000,
            (n, cb) => {
              broker.publish('p1', 'test message', (err, publication) => {
                assert.ifError(err);
                publication.on('success', () => {
                  cb();
                });
              });
            },
            (err) => {
              assert.ifError(err);
              done();
            },
          );
        },
      );
    },
    { timeout: 60000 },
  );

  it(
    'should publish lots of messages using confirm channels',
    (test, done) => {
      createBroker(
        {
          vhosts,
          publications: {
            p1: {
              queue: 'q1',
              confirm: true,
            },
          },
        },
        (err, broker) => {
          assert.ifError(err);

          async.timesSeries(
            1000,
            (n, cb) => {
              broker.publish('p1', 'test message', (err, publication) => {
                assert.ifError(err);
                publication.on('success', () => {
                  cb();
                });
              });
            },
            (err) => {
              assert.ifError(err);
              done();
            },
          );
        },
      );
    },
    { timeout: 20000 },
  );

  it('should symetrically encrypt messages', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            queue: 'q1',
            encryption: {
              name: 'well-known',
              key: 'f81db52a3b2c717fe65d9a3b7dd04d2a08793e1a28e3083db3ea08db56e7c315',
              ivLength: 16,
              algorithm: 'aes-256-cbc',
            },
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);

        broker.publish('p1', 'test message', (err, publication) => {
          assert.ifError(err);
          publication.on('success', (messageId) => {
            amqputils.getMessage('q1', namespace, (err, message) => {
              assert.ifError(err);
              assert.ok(message);
              assert.strictEqual(messageId, message.properties.messageId);
              assert.strictEqual('well-known', message.properties.headers.rascal.encryption.name);
              assert.strictEqual(32, message.properties.headers.rascal.encryption.iv.length);
              assert.strictEqual('text/plain', message.properties.headers.rascal.encryption.originalContentType);
              assert.strictEqual('application/octet-stream', message.properties.contentType);
              done();
            });
          });
        });
      },
    );
  });

  it('should report encryption errors', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            queue: 'q1',
            encryption: {
              name: 'well-known',
              key: 'aa',
              ivLength: 16,
              algorithm: 'aes-256-cbc',
            },
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);

        broker.publish('p1', 'test message', (err) => {
          assert.strictEqual(err.message, 'Invalid key length');
          done();
        });
      },
    );
  });

  it('should capture publication stats for normal channels', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', { message: 'test message' }, (err, publication) => {
          assert.ifError(err);
          publication.on('success', () => {
            assert.strictEqual(typeof publication.stats.duration, 'number');
            assert.ok(publication.stats.duration >= 0);
            done();
          });
        });
      },
    );
  });

  it('should capture publication stats for confirm channels', (test, done) => {
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
            confirm: true,
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', 'test message', (err, publication) => {
          assert.ifError(err);
          publication.on('success', () => {
            assert.strictEqual(typeof publication.stats.duration, 'number');
            assert.ok(publication.stats.duration >= 0);
            done();
          });
        });
      },
    );
  });

  it('should publish large messages to exchanges when using confirm channels', (test, done) => {
    Object.assign(vhosts['/'], {
      publicationChannelPools: {
        confirmPool: {
          min: 1,
          max: 1,
        },
      },
    });
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            exchange: 'e1',
            confirm: true,
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        const msg = Buffer.alloc(20000000);
        async.timesSeries(
          2,
          (n, cb) => {
            broker.publish('p1', msg, (err, publication) => {
              assert.ifError(err);
              publication.on('success', () => {
                cb();
              });
            });
          },
          done,
        );
      },
    );
  });

  it('should publish large messages to queues when using confirm channels', (test, done) => {
    Object.assign(vhosts['/'], {
      publicationChannelPools: {
        confirmPool: {
          min: 1,
          max: 1,
        },
      },
    });
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            queue: 'q1',
            confirm: true,
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        const msg = Buffer.alloc(20000000);
        async.timesSeries(
          2,
          (n, cb) => {
            broker.publish('p1', msg, (err, publication) => {
              assert.ifError(err);
              publication.on('success', () => {
                cb();
              });
            });
          },
          done,
        );
      },
    );
  });

  it('should set the replyTo property', (test, done) => {
    const replyTo = uuid();
    Object.assign(vhosts['/'].queues, {
      rq: {
        replyTo,
      },
    });
    createBroker(
      {
        vhosts,
        publications: {
          p1: {
            queue: 'q1',
            replyTo: 'rq',
          },
        },
      },
      (err, broker) => {
        assert.ifError(err);
        broker.publish('p1', 'test message', (err, publication) => {
          assert.ifError(err);
          publication.on('success', () => {
            amqputils.getMessage('q1', namespace, (err, message) => {
              assert.ifError(err);
              assert.ok(message);
              assert.ok(new RegExp(`\\w+-\\w+-\\w+-\\w+-\\w+:rq:${replyTo}`).test(message.properties.replyTo), format('%s failed to match expected pattern', message.properties.replyTo));
              done();
            });
          });
        });
      },
    );
  });

  function createBroker(config, next) {
    config = _.defaultsDeep(config, testConfig);
    Broker.create(config, (err, _broker) => {
      broker = _broker;
      next(err, broker);
    });
  }
}, { timeout: 2000 });
