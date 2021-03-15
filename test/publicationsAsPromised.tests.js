const assert = require('assert');
const _ = require('lodash');
const amqplib = require('amqplib/callback_api');
const testConfig = require('../lib/config/tests');
const format = require('util').format;
const uuid = require('uuid').v4;
const BrokerAsPromised = require('..').BrokerAsPromised;
const AmqpUtils = require('./utils/amqputils');

describe('Publications As Promised', function() {

  let broker;
  let amqputils;
  let namespace;
  let vhosts;

  beforeEach(function(test, done) {

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
      if (broker) return broker.nuke().catch(done).then(done);
      done();
    });
  });

  it('should report unknown publications', function() {
    return createBroker({
      vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }).then(function(broker) {
      return broker.publish('does-not-exist', 'test message').catch(function(err) {
        assert.ok(err);
        assert.equal(err.message, 'Unknown publication: does-not-exist');
      });
    });
  });

  it('should report deprecated publications', function(test, done) {
    createBroker({
      vhosts,
      publications: {
        p1: {
          exchange: 'e1',
          deprecated: true,
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function(publication) {
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, 'test message', done);
        });
      });
    });
  });

  it('should publish text messages to normal exchanges', function(test, done) {
    createBroker({
      vhosts,
      publications: {
        p1: {
          exchange: 'e1',
          confirm: false,
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function(publication) {
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, 'test message', done);
        });
      });
    });
  });

  it('should publish text messages using confirm channels to exchanges', function(test, done) {
    createBroker({
      vhosts,
      publications: {
        p1: {
          exchange: 'e1',
          confirm: true,
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function(publication) {
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, 'test message', done);
        });
      });
    });
  });

  it('should publish text messages to queues', function(test, done) {
    createBroker({
      vhosts,
      publications: {
        p1: {
          queue: 'q1',
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function(publication) {
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, 'test message', done);
        });
      });
    });
  });

  it('should decorate the message with a uuid', function(test, done) {
    createBroker({
      vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function(publication) {
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

  it('should publish to using confirm channels to queues', function(test, done) {
    createBroker({
      vhosts,
      publications: {
        p1: {
          queue: 'q1',
          confirm: true,
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function(publication) {
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, 'test message', done);
        });
      });
    });
  });

  it('should publish json messages to normal exchanges', function(test, done) {
    createBroker({
      vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }).then(function(broker) {
      broker.publish('p1', { message: 'test message' }).then(function(publication) {
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, JSON.stringify({ message: 'test message' }), done);
        });
      });
    });
  });

  it('should publish messages with custom contentType to normal exchanges', function(test, done) {
    createBroker({
      vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }).then(function(broker) {
      broker.publish('p1', { message: 'test message' }, { options: { contentType: 'application/vnd+custom.contentType.v1' } }).then(function(publication) {
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
      vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }).then(function(broker) {
      broker.publish('p1', Buffer.from('test message')).then(function(publication) {
        publication.on('success', function() {
          amqputils.assertMessage('q1', namespace, 'test message', done);
        });
      });
    });
  });

  it('should allow publish overrides', function(test, done) {
    createBroker({
      vhosts,
      publications: {
        p1: {
          queue: 'q1',
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message', { options: { expiration: 1 } }).then(function(publication) {
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
      vhosts,
      publications: {
        p1: {
          exchange: 'xx',
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message', { options: { expiration: 1 } }).then(function(publication) {
        publication.on('return', function(message) {
          assert.ok(message);
          done();
        });
      });
    });
  });

  it('should forward messages to publications', function(test, done) {
    createBroker({
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
    }).then(function(broker) {

      let messageId;

      broker.subscribe('s1').then(function(subscription) {

        subscription.on('message', function(message, content, ackOrNack) {
          broker.forward('p2', message).then(function(publication) {
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

      broker.publish('p1', 'test message').then(function(publication) {
        publication.on('success', function(_messageId) {
          messageId = _messageId;
        });
      });
    });
  });

  it('should forward messages to publications maintaining the original routing key when not overriden', function(test, done) {
    createBroker({
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
    }).then(function(broker) {

      broker.subscribe('s1').then(function(subscription) {

        subscription.on('message', function(message, content, ackOrNack) {

          broker.forward('p2', message).then(function(publication) {
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

      broker.publish('p1', 'test message');
    });
  });

  it('should publish lots of messages using normal channels', function() {

    return createBroker({
      vhosts,
      publications: {
        p1: {
          queue: 'q1',
          confirm: false,
        },
      },
    }).then(function(broker) {
      return new Array(1000).fill().reduce(function(p) {
        return p.then(function() {
          return broker.publish('p1', 'test message').then(function(publication) {
            return new Promise(function(resolve) {
              publication.on('success', function() {
                resolve();
              });
            });
          });
        });
      }, Promise.resolve());
    });
  }, { timeout: 60000 });

  it('should publish lots of messages using confirm channels', function() {

    return createBroker({
      vhosts,
      publications: {
        p1: {
          queue: 'q1',
          confirm: true,
        },
      },
    }).then(function(broker) {
      return new Array(1000).fill().reduce(function(p) {
        return p.then(function() {
          return broker.publish('p1', 'test message').then(function(publication) {
            return new Promise(function(resolve) {
              publication.on('success', function() {
                resolve();
              });
            });
          });
        });
      }, Promise.resolve());
    });
  }, { timeout: 20000 });

  it('should symetrically encrypt messages', function(test, done) {
    createBroker({
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
    }).then(function(broker) {

      broker.publish('p1', 'test message').then(function(publication) {
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

  it('should report encryption errors', function() {
    return createBroker({
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
    }).then(function(broker) {
      return broker.publish('p1', 'test message').catch(function(err) {
        assert.equal(err.message, 'Invalid key length');
      });
    });
  });


  it('should capture publication stats for normal channels', function(test, done) {
    createBroker({
      vhosts,
      publications: {
        p1: {
          exchange: 'e1',
        },
      },
    }).then(function(broker) {
      broker.publish('p1', { message: 'test message' }).then(function(publication) {
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
      vhosts,
      publications: {
        p1: {
          exchange: 'e1',
          confirm: true,
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function(publication) {
        publication.on('success', function() {
          assert.equal(typeof publication.stats.duration, 'number');
          assert.ok(publication.stats.duration >= 0);
          done();
        });
      });
    });
  });

  function createBroker(config) {
    config = _.defaultsDeep(config, testConfig);
    return BrokerAsPromised.create(config)
      .catch(function(err) {
        if (err.broker) broker = err[err.broker];
        throw err;
      }).then(function(_broker) {
        broker = _broker;
        return broker;
      });
  }
}, { timeout: 2000 });
