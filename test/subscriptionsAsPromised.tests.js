const assert = require('assert');
const _ = require('lodash').runInContext();
const amqplib = require('amqplib/callback_api');
const testConfig = require('../lib/config/tests');
const uuid = require('uuid').v4;
const BrokerAsPromised = require('..').BrokerAsPromised;
const AmqpUtils = require('./utils/amqputils');

describe('Subscriptions As Promised', function() {

  let broker;
  let amqputils;
  let namespace;
  let vhosts;
  let publications;
  let subscriptions;

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
            bindingKey: 'foo',
          },
          b2: {
            source: 'e2',
            destination: 'q2',
            bindingKey: 'bar',
          },
          b3: {
            source: 'e1',
            destination: 'q3',
            bindingKey: 'baz',
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
      p2: {
        vhost: '/',
        exchange: 'e2',
        routingKey: 'bar',
      },
      p3: {
        vhost: '/',
        exchange: 'xx',
      },
    };

    subscriptions = {
      s1: {
        vhost: '/',
        queue: 'q1',
      },
      s2: {
        vhost: '/',
        queue: 'q2',
      },
      s3: {
        vhost: '/',
        queue: 'q3',
      },
      s4: {
        vhost: '/',
        queue: 'q1',
        deprecated: true,
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

  it('should report unknown subscriptions', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.subscribe('does-not-exist').catch(function(err) {
        assert.ok(err);
        assert.equal(err.message, 'Unknown subscription: does-not-exist');
        done();
      });
    });
  });

  it('should consume to text/plain messages', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert(message);
            assert.equal(message.properties.contentType, 'text/plain');
            assert.equal(content, 'test message');
            done();
          });
        });
      });
    });
  });

  it('should not consume messages before a listener is bound', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        broker.subscribe('s1').then(function(subscription) {
          setTimeout(function() {
            subscription.on('message', function(message, content, ackOrNack) {
              assert(message);
              assert.equal(content, 'test message');
              done();
            });
          }, 500);
        });
      });
    });
  });

  it('should consume to text/other messages', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message', {
        options: {
          contentType: 'text/csv',
        },
      }).then(function(publication) {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert(message);
            assert.equal(message.properties.contentType, 'text/csv');
            assert.equal(content, 'test message');
            done();
          });
        });
      });
    });
  });

  it('should consume to whatever/whatever messages', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message', {
        options: {
          contentType: 'x-foo-bar/blah',
        },
      }).then(function(publication) {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert(message);
            assert.equal(message.properties.contentType, 'x-foo-bar/blah');
            assert.equal(content, 'test message');
            done();
          });
        });
      });
    });
  });

  it('should consume to JSON messages', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', { message: 'test message' }).then(function() {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert(message);
            assert.equal(message.properties.contentType, 'application/json');
            assert.equal(content.message, 'test message');
            done();
          });
        });
      });
    });
  });

  it('should consume to Buffer messages', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', Buffer.from('test message')).then(function() {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert(message);
            assert.equal(message.properties.contentType, undefined);
            assert.equal(content, 'test message');
            done();
          });
        });
      });
    });
  });

  it('should not consume invalid messages when no invalid content/message listener is bound', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      amqputils.publishMessage('e1', namespace, Buffer.from('not json'), { routingKey: 'foo', contentType: 'application/json' }, function(err) {
        assert.ifError(err);
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function() {
            assert.ok(false, 'Message should not have been delivered');
          }).on('error', function() {
            broker.shutdown().then(function() {
              amqputils.assertMessageAbsent('q1', namespace, done);
            });
          });
        });
      });
    });
  });

  it('should not consume an invalid messages messages when a listener is bound to invalid_content', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      amqputils.publishMessage('e1', namespace, Buffer.from('not json'), { routingKey: 'foo', contentType: 'application/json' }, function(err) {
        assert.ifError(err);
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function() {
            assert.ok(false, 'Message should not have been delivered');
          }).on('invalid_content', function(err, message, ackOrNack) {
            assert(err);
            broker.shutdown().then(function() {
              amqputils.assertMessage('q1', namespace, 'not json', done);
            });
          });
        });
      });
    });
  });

  it('should not consume an invalid messages messages when a listener is bound to invalid_message', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      amqputils.publishMessage('e1', namespace, Buffer.from('not json'), { routingKey: 'foo', contentType: 'application/json' }, function(err) {
        assert.ifError(err);
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function() {
            assert.ok(false, 'Message should not have been delivered');
          }).on('invalid_message', function(err, message, ackOrNack) {
            assert(err);
            broker.shutdown().then(function() {
              amqputils.assertMessage('q1', namespace, 'not json', done);
            });
          });
        });
      });
    });
  });

  it('should consume an invalid message when a listener acks it', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      amqputils.publishMessage('e1', namespace, Buffer.from('not json'), { routingKey: 'foo', contentType: 'application/json' }, function(err) {
        assert.ifError(err);
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function() {
            assert.ok(false, 'Message should not have been delivered');
          }).on('invalid_content', function(err, message, ackOrNack) {
            assert(err);
            ackOrNack().then(function() {
              setTimeout(function() {
                broker.shutdown().then(function() {
                  amqputils.assertMessageAbsent('q1', namespace, done);
                });
              });
            });
          });
        });
      });
    });
  });

  it('should consume an invalid message when a listener nacks it', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      amqputils.publishMessage('e1', namespace, Buffer.from('not json'), { routingKey: 'foo', contentType: 'application/json' }, function(err) {
        assert.ifError(err);
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function() {
            assert.ok(false, 'Message should not have been delivered');
          }).on('invalid_content', function(err, message, ackOrNack) {
            assert(err);
            ackOrNack(err).then(function() {
              setTimeout(function() {
                broker.shutdown().then(function() {
                  amqputils.assertMessageAbsent('q1', namespace, done);
                });
              });
            });
          });
        });
      });
    });
  });

  it('should force the content type when specified', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          contentType: 'text/plain',
        },
      },
    }).then(function(broker) {
      broker.publish('p1', { message: 'test message' }).then(function() {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert(message);
            assert.equal(message.properties.contentType, 'application/json');
            assert.equal(content, '{\"message\":\"test message\"}');
            done();
          });
        });
      });
    });
  });

  it('should filter subscriptions by routing key', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          vhost: '/',
          exchange: 'e1',
          routingKey: 'bar',
        },
      },
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(false, 'Should not have received any messages');
          });
        });
        setTimeout(done, 500);
      });
    });
  });

  it('should consume auto acknowledged messages', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          options: {
            noAck: true,
          },
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            broker.shutdown().then(function() {
              amqputils.assertMessageAbsent('q1', namespace, done);
            });
          });
        });
      });
    });
  });

  it('should not consume unacknowledged messages', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {

        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            broker.shutdown().then(function() {
              amqputils.assertMessage('q1', namespace, 'test message', done);
            });
          });
        });
      });
    });
  });

  it('should consume acknowledged messages', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {

        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            ackOrNack();
            setTimeout(function() {
              broker.shutdown().then(function() {
                amqputils.assertMessageAbsent('q1', namespace, done);
              });
            }, 100);
          });
        });
      });
    });
  });

  it('should consume rejected messages by default', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {

        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            ackOrNack(new Error('reject'));
            setTimeout(function() {
              broker.shutdown().then(function() {
                amqputils.assertMessageAbsent('q1', namespace, done);
              });
            }, 100);
          });
        });
      });
    });
  });

  it('should reject messages when requested', function(test, done) {
    createBroker({
      vhosts: {
        '/': {
          namespace: namespace,
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
              options: {
                arguments: {
                  'x-dead-letter-exchange': 'e2',
                },
              },
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
              bindingKey: 'foo',
            },
          },
        },
      },
      publications: _.pick(publications, 'p1'),
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
        },
        s2: {
          vhost: '/',
          queue: 'q2',
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {

        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            ackOrNack(new Error('reject'));
          });
        });

        broker.subscribe('s2').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            done();
          });
        });
      });
    });
  });

  it('should requeue messages when requested', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {

        const messages = {};
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
            if (messages[message.properties.messageId] < 10) return ackOrNack(new Error('retry'), {
              strategy: 'nack',
              requeue: true,
            });
            done();
          });
        });
      });
    });
  });

  it('should defer requeueing messages when requested', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {

        let numberOfMessages = 0;
        const startTime = new Date().getTime();
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            numberOfMessages++;
            if (numberOfMessages < 10) return ackOrNack(new Error('retry'), {
              strategy: 'nack',
              defer: 100,
              requeue: true,
            });
            const stopTime = new Date().getTime();
            assert.ok((stopTime - startTime) >= 900, 'Retry was not deferred');
            done();
          });
        });
      });
    });
  });

  it('should count redeliveries', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          redeliveries: {
            counter: 'inMemory',
          },
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        let errors = 0;
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            if (message.properties.headers.rascal.redeliveries >= 10) return subscription.cancel().then(done);
            throw new Error('oh no');
          }).on('error', function() {
            if (errors++ > 10) done(new Error('Redeliveries were not counted'));
          });
        });
      });
    });
  });

  it('should notify when redeliveries limit is exceeded', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          redeliveries: {
            limit: 5,
            counter: 'inMemory',
          },
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {

        let errors = 0;
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            throw new Error('oh no');
          }).on('redeliveries_exceeded', function(err, message, ackOrNack) {
            assert(err);
            broker.shutdown().then(function() {
              amqputils.assertMessage('q1', namespace, 'test message', done);
            });
          }).on('error', function() {
            if (errors++ > 5) done(new Error('Redeliveries were exceeded'));
          });
        });
      });
    });
  });

  it('should notify when redeliveries error is exceeded', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          redeliveries: {
            limit: 5,
            counter: 'inMemory',
          },
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {

        let errors = 0;
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            throw new Error('oh no');
          }).on('redeliveries_error', function(err, message, ackOrNack) {
            assert(err);
            broker.shutdown().then(function() {
              amqputils.assertMessage('q1', namespace, 'test message', done);
            });
          }).on('error', function() {
            if (errors++ > 5) done(new Error('Redeliveries were exceeded'));
          });
        });
      });
    });
  });

  it('should consume a poison messages when no listener is bound', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          redeliveries: {
            limit: 5,
            counter: 'inMemory',
          },
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {

        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            throw new Error('oh no');
          }).on('error', function(err) {
            if (!/Message .* has exceeded 5 redeliveries/.test(err.message)) return;
            broker.shutdown().then(function() {
              amqputils.assertMessageAbsent('q1', namespace, done);
            });
          });
        });
      });
    });
  });

  it('should consume a poison message when a listener acks it', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          redeliveries: {
            limit: 5,
            counter: 'inMemory',
          },
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        broker.subscribe('s1').then(function(subscription) {
          let errors = 0;
          subscription.on('message', function(message, content, ackOrNack) {
            throw new Error('oh no');
          }).on('redeliveries_exceeded', function(err, message, ackOrNack) {
            assert(err);
            ackOrNack().then(function() {
              setTimeout(function() {
                broker.shutdown().then(function() {
                  amqputils.assertMessageAbsent('q1', namespace, done);
                });
              });
            });
          }).on('error', function() {
            if (errors++ > 5) done(new Error('Redeliveries were exceeded'));
          });
        });
      });
    });
  });

  it('should republish messages to queue when requested', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {

        const messages = {};
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
            if (messages[message.properties.messageId] < 10) return ackOrNack({ message: 'republish me', code: 'red' }, { strategy: 'republish' });
            assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].republished, 9);
            assert.equal(message.properties.headers.rascal.error.message, 'republish me');
            assert.equal(message.properties.headers.rascal.error.code, 'red');
            done();
          });
        });
      });
    });
  });

  it('should truncate error messages when republishing', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        const messages = {};
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
            if (messages[message.properties.messageId] < 10) return ackOrNack(new Error(_.pad('x', 10000, 'x')), { strategy: 'republish' });
            assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].republished, 9);
            assert.equal(message.properties.headers.rascal.error.message.length, 1024);
            done();
          });
        });
      });
    });
  });

  it('should maintain original fields, properties and headers when republished', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message', { options: { persistent: true, headers: { foo: 'bar' } } }).then(function(publication) {
        publication.on('success', function(messageId) {
          const messages = {};
          broker.subscribe('s1').then(function(subscription) {
            subscription.on('message', function(message, content, ackOrNack) {
              assert.ok(message);
              messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
              if (messages[message.properties.messageId] < 2) return ackOrNack(new Error('republish'), { strategy: 'republish' });
              assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].republished, 1);
              assert.equal(message.properties.headers.foo, 'bar');
              assert.equal(message.properties.messageId, messageId);
              assert.equal(message.fields.routingKey, 'foo');
              assert.equal(message.properties.deliveryMode, 2);
              done();
            });
          });
        });
      });
    });
  });

  it('should cap republishes when requested', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message');

      let count = 0;
      broker.subscribe('s1').then(function(subscription) {
        subscription.on('message', function(message, content, ackOrNack) {
          count++;
          ackOrNack(new Error('republish'), { strategy: 'republish', attempts: 5 });
        });
      });

      setTimeout(function() {
        assert.equal(count, 6);
        done();
      }, 500);

    });
  });

  it('should defer republishing messages when requested', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {

        let numberOfMessages = 0;
        const startTime = new Date().getTime();
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            numberOfMessages++;
            if (numberOfMessages < 10) return ackOrNack(new Error('republish'), { strategy: 'republish', defer: 100 });
            const stopTime = new Date().getTime();
            assert.ok((stopTime - startTime) >= 900, 'Republish was not deferred');
            done();
          });
        });
      });
    });
  });

  it('should immediately nack republished messages when requested', function(test, done) {
    createBroker({
      vhosts: {
        '/': {
          namespace: namespace,
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
              options: {
                arguments: {
                  'x-dead-letter-exchange': 'e2',
                },
              },
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
      },
      publications: _.pick(publications, 'p1'),
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
        },
        s2: {
          vhost: '/',
          queue: 'q2',
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {

        broker.subscribe('s1').then(function(subscription) {
          let count = 0;
          subscription.on('message', function(message, content, ackOrNack) {
            assert.equal(++count, 1);
            assert.ok(message);
            ackOrNack(new Error('immediate nack'), {
              strategy: 'republish',
              immediateNack: true,
            });
          });
        });

        broker.subscribe('s2').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            done();
          });
        });
      });
    });
  });

  it('should forward messages to publication when requested', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message');

      broker.subscribe('s1').then(function(subscription) {
        subscription.on('message', function(message, content, ackOrNack) {
          assert.ok(message);
          ackOrNack({ message: 'forward me', code: 'red' }, { strategy: 'forward', publication: 'p2' });
        });
      });

      broker.subscribe('s2').then(function(subscription) {
        subscription.on('message', function(message, content, ackOrNack) {
          assert.ok(message);
          ackOrNack();
          assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1);
          assert.equal(message.properties.headers.CC.length, 1);
          assert.equal(message.properties.headers.CC[0], broker.qualify('/', 'q1') + '.bar');
          assert.equal(message.properties.headers.rascal.error.message, 'forward me');
          assert.equal(message.properties.headers.rascal.error.code, 'red');
          done();
        });
      });
    });
  });

  it('should truncate error messages when forwarding', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message');

      broker.subscribe('s1').then(function(subscription) {
        subscription.on('message', function(message, content, ackOrNack) {
          assert.ok(message);
          ackOrNack(new Error(_.pad('x', 10000, 'x')), { strategy: 'forward', publication: 'p2' });
        });
      });

      broker.subscribe('s2').then(function(subscription) {
        subscription.on('message', function(message, content, ackOrNack) {
          assert.ok(message);
          ackOrNack();
          assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1);
          assert.equal(message.properties.headers.rascal.error.message.length, 1024);
          done();
        });
      });
    });
  });

  it('should override routing key when forwarding messages', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message');

      broker.subscribe('s1').then(function(subscription) {
        subscription.on('message', function(message, content, ackOrNack) {
          assert.ok(message);
          ackOrNack(new Error('forward'), { strategy: 'forward', publication: 'p1', options: { routingKey: 'baz' }} );
        });
      });

      broker.subscribe('s3').then(function(subscription) {
        subscription.on('message', function(message, content, ackOrNack) {
          assert.ok(message);
          ackOrNack();
          assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1);
          done();
        });
      });
    });
  });

  it('should maintain original fields, properties and headers when forwarding messages', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {

      let messageId;

      broker.publish('p1', 'test message', { options: { headers: { foo: 'bar' } } }).then(function(publication) {
        publication.on('success', function(_messageId) {
          messageId = _messageId;
        });
      });

      broker.subscribe('s1').then(function(subscription) {
        subscription.on('message', function(message, content, ackOrNack) {
          assert.ok(message);
          ackOrNack(new Error('forward'), { strategy: 'forward', publication: 'p2' });
        });
      });

      broker.subscribe('s2').then(function(subscription) {
        subscription.on('message', function(message, content, ackOrNack) {
          assert.ok(message);
          ackOrNack();
          assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1);
          assert.equal(message.properties.headers.foo, 'bar');
          assert.equal(message.properties.messageId, messageId);
          assert.equal(message.fields.routingKey, 'foo');
          done();
        });
      });
    });
  });

  it('should not maintain original routing headers when requested', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {

      let messageId;

      broker.publish('p1', 'test message', { options: { headers: { foo: 'bar' } } }).then(function(publication) {
        publication.on('success', function(_messageId) {
          messageId = _messageId;
        });
      });

      broker.subscribe('s1').then(function(subscription) {
        subscription.on('message', function(message, content, ackOrNack) {
          assert.ok(message);
          ackOrNack(new Error('forward'), { strategy: 'forward', publication: 'p2', restoreRoutingHeaders: false });
        });
      });

      broker.subscribe('s2').then(function(subscription) {
        subscription.on('message', function(message, content, ackOrNack) {
          assert.ok(message);
          ackOrNack();
          assert.equal(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1);
          assert.equal(message.properties.headers.foo, 'bar');
          assert.equal(message.properties.messageId, messageId);
          assert.equal(message.fields.routingKey, 'bar');
          done();
        });
      });
    });
  });

  it('should cap forwards when requested', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message');

      let count = 0;

      broker.subscribe('s1').then(function(subscription) {
        subscription.on('message', function(message, content, ackOrNack) {
          assert.ok(message);
          count++;
          ackOrNack(new Error('forward'), { strategy: 'forward', publication: 'p1', attempts: 5 });
        });
      });

      setTimeout(function() {
        assert.equal(count, 6);
        done();
      }, 500);

    });
  });

  it('should error when forwarding messages to /dev/null', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function(publication) {
        publication.on('success', function(messageId) {
          broker.subscribe('s1').then(function(subscription) {
            subscription.on('message', function(message, content, ackOrNack) {
              assert.ok(message);
              ackOrNack(new Error('forward'), { strategy: 'forward', publication: 'p3' }).catch(function(err) {
                assert.ok(err);
                assert.equal('Message: ' + messageId + ' was forwared to publication: p3, but was returned', err.message);
                done();
              });
            });
          });
        });
      });
    });
  });

  it('should error on unknown recovery strategy', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function(publication) {
        publication.on('success', function(messageId) {
          broker.subscribe('s1').then(function(subscription) {
            subscription.on('message', function(message, content, ackOrNack) {
              assert.ok(message);
              ackOrNack(new Error('unknown'), { strategy: 'foo' }).catch(function(err) {
                assert.ok(err);
                assert.equal('Error recovering message: ' + messageId + '. No such strategy: foo.', err.message);
                done();
              });
            });
          });
        });
      });
    });
  });

  it('should chain recovery strategies', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        const messages = {};
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            ackOrNack(new Error('retry'), [
              { strategy: 'republish', attempts: 5 },
              { strategy: 'ack' },
            ]).then(function() {
              messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
              if (messages[message.properties.messageId] < 6) return;
              setTimeout(function() {
                assert.equal(messages[message.properties.messageId], 6);
                done();
              }, 500);
            });
          });
        });
      });
    });
  });

  it('should not rollback message when shutting down broker after ack', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        const messages = {};
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
            ackOrNack().then(function() {
              broker.shutdown().then(function() {
                amqputils.assertMessageAbsent('q1', namespace, done);
              });
            });
          });
        });
      });
    });
  });

  it('should not rollback message when shutting down broker after ack', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        const messages = {};
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
            ackOrNack(new Error('Oh Noes'), [
              { strategy: 'ack' },
            ]).then(function() {
              broker.shutdown().then(function() {
                amqputils.assertMessageAbsent('q1', namespace, done);
              });
            });
          });
        });
      });
    });
  });

  it('should nack messages when all recovery strategies have been attempted', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        const messages = {};
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert.ok(message);
            messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
            ackOrNack(new Error('retry'), []).then(function() {
              broker.shutdown().then(function() {
                amqputils.assertMessageAbsent('q1', namespace, done);
              });
            });
          });
        });
      });
    });
  });

  it('should limit concurrent messages using prefetch', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          prefetch: 5,
        },
      },
    }).then(function(broker) {
      const promises = new Array(10).fill().map(function() {
        return broker.publish('p1', 'test message');
      });

      Promise.all(promises).then(function() {
        let messages = 0;
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert(message);
            messages++;
            if (messages === 5) {
              setTimeout(function() {
                assert.equal(messages, 5);
                done();
              }, 500);
            }
          });
        });
      });
    });
  });

  it('should consume to messages from a replyTo queue', function(test, done) {
    const replyTo = uuid();
    createBroker({
      vhosts: {
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
              replyTo: replyTo,
            },
          },
          bindings: {
            b1: {
              source: 'e1',
              destination: 'q1',
              bindingKey: 'foo.#',
            },
          },
        },
      },
      publications: _.pick(publications, 'p1'),
      subscriptions: _.pick(subscriptions, 's1'),
    }).then(function(broker) {
      broker.publish('p1', 'test message', replyTo + '.foo.bar').then(function() {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert(message);
            assert.equal(content, 'test message');
            done();
          });
        });
      });
    });
  });

  it('should emit channel errors', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        broker.subscribe('s1', { retry: false }).then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            ackOrNack();
            ackOrNack(); // trigger a channel error
          }).on('error', function(err) {
            assert.ok(err);
            assert.equal('Channel closed by server: 406 (PRECONDITION-FAILED) with message "PRECONDITION_FAILED - unknown delivery tag 1"', err.message);
            done();
          });
        });
      });
    });
  });

  it('should not consume messages after unsubscribing', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          options: {
            noAck: true,
          },
        },
      },
    }).then(function(broker) {
      broker.subscribe('s1').then(function(subscription) {

        subscription.on('message', function(message, content, ackOrNack) {
          assert.ok(false, 'Should not receive messages after unsubscribing');
        });

        subscription.cancel().then(function() {
          broker.publish('p1', 'test message').then(function() {
            setTimeout(done, 500);
          });
        });
      });
    });
  });

  it('should tollerate repeated unsubscription', function() {
    return createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          options: {
            noAck: true,
          },
        },
      },
    }).then(function(broker) {
      return broker.subscribe('s1').then(function(subscription) {
        const promises = new Array(3).fill().map(function() {
          return subscription.cancel();
        });
        return Promise.all(promises);
      });
    });
  });

  it('should not warn about emitter leaks', function() {

    const config = {
      vhosts: vhosts,
      publications: publications,
      subscriptions: {},
    };

    const times = new Array(11).fill();

    times.forEach(function(__, i) {
      config.subscriptions['s' + i] = {
        vhost: '/',
        queue: 'q1',
        options: {
          noAck: true,
        },
      };
    });

    return createBroker(config).then(function(broker) {
      const promises = times.map(function(__, i) {
        return broker.subscribe('s' + i);
      });
      return Promise.all(promises);
    });
  });

  it('should attach the subscription vhost to message properties', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: subscriptions,
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert(message.properties);
            assert.equal(message.properties.headers.rascal.originalVhost, '/');
            done();
          });
        });
      });
    });
  });

  it('should emit an error if trying to ack a message after unsubscribing', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: _.defaultsDeep({}, subscriptions, { s1: { deferCloseChannel: 100 } }),
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            subscription.cancel().then(function() {
              setTimeout(function() {
                ackOrNack().catch(function(err) {
                  assert.equal(err.message, 'The channel has been closed. Unable to ack message');
                  done();
                });
              }, 200);
            });
          });
        });
      });
    });
  });

  it('should emit an error if trying to nack a message after unsubscribing', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: _.defaultsDeep({}, subscriptions, { s1: { deferCloseChannel: 100 } }),
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            subscription.cancel().then(function() {
              setTimeout(function() {
                ackOrNack(new Error('Oh Noes!')).catch(function(err) {
                  assert.equal(err.message, 'The channel has been closed. Unable to nack message');
                  done();
                });
              }, 200);
            });
          });
        });
      });
    });
  });

  it('should symetrically decrypt messages', function(test, done) {
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
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          encryption: {
            'well-known': {
              key: 'f81db52a3b2c717fe65d9a3b7dd04d2a08793e1a28e3083db3ea08db56e7c315',
              ivLength: 16,
              algorithm: 'aes-256-cbc',
            },
          },
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function(message, content, ackOrNack) {
            assert(message);
            assert.equal(message.properties.contentType, 'application/octet-stream');
            assert.equal(content, 'test message');
            done();
          });
        });
      });
    });
  });

  it('should report invalid_content when missing encryption profile', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          queue: 'q1',
          encryption: {
            name: 'not-well-known',
            key: 'f81db52a3b2c717fe65d9a3b7dd04d2a08793e1a28e3083db3ea08db56e7c315',
            ivLength: 16,
            algorithm: 'aes-256-cbc',
          },
        },
      },
      subscriptions: {
        s1: {
          queue: 'q1',
          encryption: {},
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function() {
            assert.ok(false, 'Message should not have been delivered');
          }).on('invalid_content', function(err, message, ackOrNack) {
            assert.equal(err.message, 'Unknown encryption profile: not-well-known');
            done();
          });
        });
      });
    });
  });

  it('should fail with invalid content when encryption errors', function(test, done) {
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
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          encryption: {
            'well-known': {
              key: 'aa',
              ivLength: 16,
              algorithm: 'aes-256-cbc',
            },
          },
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function() {
        broker.subscribe('s1').then(function(subscription) {
          subscription.on('message', function() {
            assert.ok(false, 'Message should not have been delivered');
          }).on('invalid_content', function(err, message, ackOrNack) {
            assert.equal(err.message, 'Invalid key length');
            done();
          });
        });
      });
    });
  });

  it('should support ackOrNack using callbacks', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          promisifyAckOrNack: false,
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function(publication) {
        publication.on('success', function(messageId) {
          broker.subscribe('s1').then(function(subscription) {
            subscription.on('message', function(message, content, ackOrNack) {
              assert.ok(message);
              ackOrNack(done);
            });
          });
        });
      });
    });
  });

  it('should support handling recovery errors using callbacks', function(test, done) {
    createBroker({
      vhosts: vhosts,
      publications: publications,
      subscriptions: {
        s1: {
          vhost: '/',
          queue: 'q1',
          promisifyAckOrNack: false,
        },
      },
    }).then(function(broker) {
      broker.publish('p1', 'test message').then(function(publication) {
        publication.on('success', function(messageId) {
          broker.subscribe('s1').then(function(subscription) {
            subscription.on('message', function(message, content, ackOrNack) {
              assert.ok(message);
              ackOrNack(new Error('unknown'), { strategy: 'foo' }, function(err) {
                assert.ok(err);
                assert.equal('Error recovering message: ' + messageId + '. No such strategy: foo.', err.message);
                done();
              });
            });
          });
        });
      });
    });
  });

  function createBroker(config) {
    config = _.defaultsDeep(config, testConfig, { defaults: { subscriptions: { promisifyAckOrNack: true } } });
    return BrokerAsPromised.create(config)
      .catch(function(err) {
        if (err.broker) broker = err[err.broker];
        throw err;
      }).then(function(_broker) {
        broker = _broker;
        return broker;
      });
  }
}, { timeout: 5000 });
