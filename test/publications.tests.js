const assert = require('assert');
const _ = require('lodash');
const async = require('async');
const amqplib = require('amqplib/callback_api');
const testConfig = require('../lib/config/tests');
const format = require('util').format;
const uuid = require('uuid').v4;
const Broker = require('..').Broker;
const AmqpUtils = require('./utils/amqputils');

describe('Publications', function() {

  let broker;
  let amqputils;
  let namespace;
  let vhosts;

  beforeEach(function(test, done) {

    namespace = uuid();

    vhosts = {
      '/': {
        namespace: namespace,
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

  it('should report unknown publications', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('does-not-exist', 'test message', function(err) {
        assert.ok(err);
        assert.equal(err.message, 'Unknown publication: does-not-exist');
        done();
      });
    });
  });

  it('should report deprecated publications', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          exchange: 'e1',
          deprecated: true,
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', 'test message', function(err, publication) {
        assert.ifError(err);
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, 'test message', done);
        });
      });
    });
  });

  it('should publish text messages to normal exchanges', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          exchange: 'e1',
          confirm: false,
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', 'test message', function(err, publication) {
        assert.ifError(err);
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, 'test message', done);
        });
      });
    });
  });

  it('should publish text messages using confirm channels to exchanges', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          exchange: 'e1',
          confirm: true,
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', 'test message', function(err, publication) {
        assert.ifError(err);
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, 'test message', done);
        });
      });
    });
  });

  it('should publish text messages to queues', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          queue: 'q1',
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', 'test message', function(err, publication) {
        assert.ifError(err);
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, 'test message', done);
        });
      });
    });
  });

  it('should publish text messages to queues via the default exchange', function(test, done) {
    createBroker({
      vhosts: vhosts,
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('/', 'test message', broker.qualify('/', 'q3'), function(err, publication) {
        assert.ifError(err);
        publication.on('success', function() {
          amqputils.assertMessage('q3', namespace, 'test message', done);
        });
      });
    });
  });

  it('should decorate the message with a uuid', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', 'test message', function(err, publication) {
        assert.ifError(err);
        publication.on('success', function(messageId) {
          assert.ok(/\w+-\w+-\w+-\w+-\w+/.test(messageId), format('%s failed to match expected pattern', messageId));

          amqputils.getMessage('q1', namespace, function(err, message) {
            assert.ifError(err);
            assert.ok(message);
            assert.equal(messageId, message.properties.messageId);
            done();
          });
        });
      });
    });
  });

  it('should honour messageId when specified', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', 'test message', { options: { messageId: 'wibble' } }, function(err, publication) {
        assert.ifError(err);
        publication.on('success', function(messageId) {
          assert.equal('wibble', messageId);

          amqputils.getMessage('q1', namespace, function(err, message) {
            assert.ifError(err);
            assert.ok(message);
            assert.equal('wibble', message.properties.messageId);
            done();
          });
        });
      });
    });
  });

  it('should decorate error events with messageId', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', 'test message', { options: { messageId: 'wibble' } }, function(err, publication) {
        assert.ifError(err);
        publication.on('success', function(messageId) {
          assert.equal('wibble', messageId);

          amqputils.getMessage('q1', namespace, function(err, message) {
            assert.ifError(err);
            assert.ok(message);
            assert.equal('wibble', message.properties.messageId);
            done();
          });
        });
        publication.on('error', function(messageId) {
          assert.equal('wibble', messageId);

          amqputils.getMessage('q1', namespace, function(err, message) {
            assert.ifError(err);
            assert.ok(message);
            assert.equal('wibble', message.properties.messageId);
            done();
          });
        });
      });
    });
  });

  it('should publish to using confirm channels to queues', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          queue: 'q1',
          confirm: true,
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', 'test message', function(err, publication) {
        assert.ifError(err);
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, 'test message', done);
        });
      });
    });
  });

  it('should publish json messages to normal exchanges', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', { message: 'test message' }, function(err, publication) {
        assert.ifError(err);
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, JSON.stringify({ message: 'test message' }), done);
        });
      });
    });
  });

  it('should publish messages with custom contentType to normal exchanges', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', { message: 'test message' }, { options: { contentType: 'application/vnd+custom.contentType.v1' } }, function(err, publication) {
        assert.ifError(err);
        publication.on('success', function() {
          amqputils.getMessage('q1', namespace, function(err, message) {
            assert.ifError(err);
            assert.ok(message, 'Message was not present');
            assert.equal(message.properties.contentType, 'application/vnd+custom.contentType.v1');
            assert.equal(message.content.toString(), JSON.stringify({ message: 'test message' }));
            done();
          });
        });
      });
    });
  });

  it('should publish buffer messages to normal exchanges', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', Buffer.from('test message'), function(err, publication) {
        assert.ifError(err);
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, 'test message', done);
        });
      });
    });
  });

  it('should allow publish overrides', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          queue: 'q1',
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', 'test message', { options: { expiration: 1 } }, function(err, publication) {
        assert.ifError(err);
        publication.on('success', function() {
          setTimeout(function() {
            amqputils.assertMessageAbsent('q1', namespace, done);
          }, 100);
        });
      });
    });
  });

  it('should report unrouted messages', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          exchange: 'xx',
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', 'test message', { options: { expiration: 1 } }, function(err, publication) {
        assert.ifError(err);
        publication.on('return', function(message) {
          assert.ok(message);
          done();
        });
      });
    });
  });

  it('should forward messages to publications', function(test, done) {
    createBroker({
      vhosts: vhosts,
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
    }, function(err, broker) {
      assert.ifError(err);

      let messageId;

      broker.subscribe('s1', function(err, subscription) {
        assert.ifError(err);

        subscription.on('message', function(message, content, ackOrNack) {
          broker.forward('p2', message, function(err, publication) {
            assert.ifError(err);
            publication.on('success', function() {
              ackOrNack();

              amqputils.getMessage('q2', namespace, function(err, message) {
                assert.ifError(err);
                assert.ok(message);
                assert.equal(message.fields.routingKey, 'rk2');
                assert.equal(message.properties.messageId, messageId);
                assert.equal(message.properties.contentType, 'text/plain');
                assert.equal(message.content.toString(), 'test message');
                assert.ok(/\w+-\w+-\w+-\w+-\w+:q1/.test(message.properties.headers.rascal.originalQueue), format('%s failed to match expected pattern', message.properties.headers.rascal.originalQueue));
                assert.equal(message.properties.headers.rascal.restoreRoutingHeaders, false);
                assert.equal(message.properties.headers.rascal.originalRoutingKey, 'rk1');
                assert.equal(message.properties.headers.rascal.originalExchange, namespace + ':e1');
                done();
              });
            });
          });
        });
      });

      broker.publish('p1', 'test message', function(err, publication) {
        assert.ifError(err);
        publication.on('success', function(_messageId) {
          messageId = _messageId;
        });
      });
    });
  });

  it('should instruct subscriber to restore routing headers when requested', function(test, done) {
    createBroker({
      vhosts: vhosts,
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
    }, function(err, broker) {
      assert.ifError(err);

      broker.subscribe('s1', function(err, subscription) {
        assert.ifError(err);

        subscription.on('message', function(message, content, ackOrNack) {
          broker.forward('p2', message, { restoreRoutingHeaders: true }, function(err, publication) {
            assert.ifError(err);
            publication.on('success', function() {
              ackOrNack();

              amqputils.getMessage('q2', namespace, function(err, message) {
                assert.ifError(err);
                assert.ok(message);
                assert.equal(message.properties.headers.rascal.restoreRoutingHeaders, true);
                done();
              });
            });
          });
        });
      });

      broker.publish('p1', 'test message', function(err) {
        assert.ifError(err);
      });
    });
  });

  it('should forward messages to publications maintaining the original routing key when not overriden', function(test, done) {
    createBroker({
      vhosts: vhosts,
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
    }, function(err, broker) {
      assert.ifError(err);

      broker.subscribe('s1', function(err, subscription) {
        assert.ifError(err);

        subscription.on('message', function(message, content, ackOrNack) {

          broker.forward('p2', message, function(err, publication) {
            assert.ifError(err);
            publication.on('success', function() {
              ackOrNack();

              amqputils.getMessage('q2', namespace, function(err, message) {
                assert.ifError(err);
                assert.ok(message);
                assert.equal(message.fields.routingKey, 'rk1');
                done();
              });
            });
          });
        });
      });

      broker.publish('p1', 'test message', function(err) {
        assert.ifError(err);
      });
    });
  });

  it('should publish lots of messages using normal channels', function(test, done) {

    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          queue: 'q1',
          confirm: false,
        },
      },
    }, function(err, broker) {
      assert.ifError(err);

      async.timesSeries(1000, function(n, cb) {
        broker.publish('p1', 'test message', function(err, publication) {
          assert.ifError(err);
          publication.on('success', function() {
            cb();
          });
        });
      }, function(err) {
        assert.ifError(err);
        done();
      });
    });
  }, { timeout: 60000 });

  it('should publish lots of messages using confirm channels', function(test, done) {

    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          queue: 'q1',
          confirm: true,
        },
      },
    }, function(err, broker) {
      assert.ifError(err);

      async.timesSeries(1000, function(n, cb) {
        broker.publish('p1', 'test message', function(err, publication) {
          assert.ifError(err);
          publication.on('success', function() {
            cb();
          });
        });
      }, function(err) {
        assert.ifError(err);
        done();
      });
    });
  }, { timeout: 20000 });

  it('should symetrically encrypt messages', function(test, done) {
    createBroker({
      vhosts: vhosts,
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
    }, function(err, broker) {
      assert.ifError(err);

      broker.publish('p1', 'test message', function(err, publication) {
        assert.ifError(err);
        publication.on('success', function(messageId) {
          amqputils.getMessage('q1', namespace, function(err, message) {
            assert.ifError(err);
            assert.ok(message);
            assert.equal(messageId, message.properties.messageId);
            assert.equal('well-known', message.properties.headers.rascal.encryption.name);
            assert.equal(32, message.properties.headers.rascal.encryption.iv.length);
            assert.equal('text/plain', message.properties.headers.rascal.encryption.originalContentType);
            assert.equal('application/octet-stream', message.properties.contentType);
            done();
          });
        });
      });
    });
  });

  it('should report encryption errors', function(test, done) {
    createBroker({
      vhosts: vhosts,
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
    }, function(err, broker) {
      assert.ifError(err);

      broker.publish('p1', 'test message', function(err) {
        assert.equal(err.message, 'Invalid key length');
        done();
      });
    });
  });

  it('should capture publication stats for normal channels', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', { message: 'test message' }, function(err, publication) {
        assert.ifError(err);
        publication.on('success', function() {
          assert.equal(typeof publication.stats.duration, 'number');
          assert.ok(publication.stats.duration >= 0);
          done();
        });
      });
    });
  });


  it('should capture publication stats for confirm channels', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          exchange: 'e1',
          confirm: true,
        },
      },
    }, function(err, broker) {
      assert.ifError(err);
      broker.publish('p1', 'test message', function(err, publication) {
        assert.ifError(err);
        publication.on('success', function() {
          assert.equal(typeof publication.stats.duration, 'number');
          assert.ok(publication.stats.duration >= 0);
          done();
        });
      });
    });
  });

  function createBroker(config, next) {
    config = _.defaultsDeep(config, testConfig);
    Broker.create(config, function(err, _broker) {
      broker = _broker;
      next(err, broker);
    });
  }
}, { timeout: 2000 });
