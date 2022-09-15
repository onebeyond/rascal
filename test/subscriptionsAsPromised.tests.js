const assert = require('assert');
const _ = require('lodash').runInContext();
const uuid = require('uuid').v4;
const amqplib = require('amqplib/callback_api');
const testConfig = require('../lib/config/tests');
const BrokerAsPromised = require('..').BrokerAsPromised;
const AmqpUtils = require('./utils/amqputils');

describe(
  'Subscriptions As Promised',
  () => {
    let broker;
    let amqputils;
    let namespace;
    let vhosts;
    let publications;
    let subscriptions;

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

      amqplib.connect((err, connection) => {
        if (err) return done(err);
        amqputils = AmqpUtils.init(connection);
        done();
      });
    });

    afterEach((test, done) => {
      amqputils.disconnect(() => {
        if (broker) return broker.nuke().then(done).catch(done);
        done();
      });
    });

    it('should report unknown subscriptions', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.subscribe('does-not-exist').catch((err) => {
          assert.ok(err);
          assert.strictEqual(err.message, 'Unknown subscription: does-not-exist');
          done();
        });
      });
    });

    it('should consume to text/plain messages', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              ackOrNack();
              assert.strictEqual(message.properties.contentType, 'text/plain');
              assert.strictEqual(content, 'test message');
              done();
            });
          });
        });
      });
    });

    it('should not consume messages before a listener is bound', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            setTimeout(() => {
              subscription.on('message', (message, content, ackOrNack) => {
                ackOrNack();
                assert.strictEqual(content, 'test message');
                done();
              });
            }, 500);
          });
        });
      });
    });

    it('should consume to text/other messages', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker
          .publish('p1', 'test message', {
            options: {
              contentType: 'text/csv',
            },
          })
          .then(() => {
            broker.subscribe('s1').then((subscription) => {
              subscription.on('message', (message, content, ackOrNack) => {
                ackOrNack();
                assert.strictEqual(message.properties.contentType, 'text/csv');
                assert.strictEqual(content.toString(), 'test message');
                done();
              });
            });
          });
      });
    });

    it('should consume to whatever/whatever messages', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker
          .publish('p1', 'test message', {
            options: {
              contentType: 'x-foo-bar/blah',
            },
          })
          .then(() => {
            broker.subscribe('s1').then((subscription) => {
              subscription.on('message', (message, content, ackOrNack) => {
                ackOrNack();
                assert.strictEqual(message.properties.contentType, 'x-foo-bar/blah');
                assert.strictEqual(content.toString(), 'test message');
                done();
              });
            });
          });
      });
    });

    it('should consume to JSON messages', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', { message: 'test message' }).then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              ackOrNack();
              assert.strictEqual(message.properties.contentType, 'application/json');
              assert.strictEqual(content.message, 'test message');
              done();
            });
          });
        });
      });
    });

    it('should consume to Buffer messages', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', Buffer.from('test message')).then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              ackOrNack();
              assert.strictEqual(message.properties.contentType, undefined);
              assert.strictEqual(content.toString(), 'test message');
              done();
            });
          });
        });
      });
    });

    it('should not consume invalid messages when no invalid content/message listener is bound', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        amqputils.publishMessage('e1', namespace, Buffer.from('not json'), { routingKey: 'foo', contentType: 'application/json' }, (err) => {
          assert.ifError(err);
          broker.subscribe('s1').then((subscription) => {
            subscription
              .on('message', () => {
                assert.ok(false, 'Message should not have been delivered');
              })
              .on('error', () => {
                broker.shutdown().then(() => {
                  amqputils.assertMessageAbsent('q1', namespace, done);
                });
              });
          });
        });
      });
    });

    it('should not consume an invalid messages messages when a listener is bound to invalid_content', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        amqputils.publishMessage('e1', namespace, Buffer.from('not json'), { routingKey: 'foo', contentType: 'application/json' }, (err) => {
          assert.ifError(err);
          broker.subscribe('s1').then((subscription) => {
            subscription
              .on('message', () => {
                assert.ok(false, 'Message should not have been delivered');
              })
              .on('invalid_content', (err) => {
                assert(err);
                broker.shutdown().then(() => {
                  amqputils.assertMessage('q1', namespace, 'not json', done);
                });
              });
          });

          broker.on('error', (err) => {
            assert.strictEqual(err.code, 'ETIMEDOUT');
          });
        });
      });
    });

    it('should not consume an invalid messages messages when a listener is bound to invalid_message', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        amqputils.publishMessage('e1', namespace, Buffer.from('not json'), { routingKey: 'foo', contentType: 'application/json' }, (err) => {
          assert.ifError(err);
          broker.subscribe('s1').then((subscription) => {
            subscription
              .on('message', () => {
                assert.ok(false, 'Message should not have been delivered');
              })
              .on('invalid_message', (err) => {
                assert(err);
                broker.shutdown().then(() => {
                  amqputils.assertMessage('q1', namespace, 'not json', done);
                });
              });
          });

          broker.on('error', (err) => {
            assert.strictEqual(err.code, 'ETIMEDOUT');
          });
        });
      });
    });

    it('should consume an invalid message when a listener acks it', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        amqputils.publishMessage('e1', namespace, Buffer.from('not json'), { routingKey: 'foo', contentType: 'application/json' }, (err) => {
          assert.ifError(err);
          broker.subscribe('s1').then((subscription) => {
            subscription
              .on('message', () => {
                assert.ok(false, 'Message should not have been delivered');
              })
              .on('invalid_content', (err, message, ackOrNack) => {
                assert(err);
                ackOrNack().then(() => {
                  setTimeout(() => {
                    broker.shutdown().then(() => {
                      amqputils.assertMessageAbsent('q1', namespace, done);
                    });
                  });
                });
              });
          });
        });
      });
    });

    it('should consume an invalid message when a listener nacks it', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        amqputils.publishMessage('e1', namespace, Buffer.from('not json'), { routingKey: 'foo', contentType: 'application/json' }, (err) => {
          assert.ifError(err);
          broker.subscribe('s1').then((subscription) => {
            subscription
              .on('message', () => {
                assert.ok(false, 'Message should not have been delivered');
              })
              .on('invalid_content', (err, message, ackOrNack) => {
                assert(err);
                ackOrNack(err).then(() => {
                  setTimeout(() => {
                    broker.shutdown().then(() => {
                      amqputils.assertMessageAbsent('q1', namespace, done);
                    });
                  });
                });
              });
          });
        });
      });
    });

    it('should force the content type when specified', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions: {
          s1: {
            vhost: '/',
            queue: 'q1',
            contentType: 'text/plain',
          },
        },
      }).then((broker) => {
        broker.publish('p1', { message: 'test message' }).then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              ackOrNack();
              assert.strictEqual(message.properties.contentType, 'application/json');
              assert.strictEqual(content, '{"message":"test message"}');
              done();
            });
          });
        });
      });
    });

    it('should filter subscriptions by routing key', (test, done) => {
      createBroker({
        vhosts,
        publications: {
          p1: {
            vhost: '/',
            exchange: 'e1',
            routingKey: 'bar',
          },
        },
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', () => {
              assert.ok(false, 'Should not have received any messages');
            });
          });
          setTimeout(done, 500);
        });
      });
    });

    it('should consume auto acknowledged messages', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions: {
          s1: {
            vhost: '/',
            queue: 'q1',
            options: {
              noAck: true,
            },
          },
        },
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message) => {
              assert.ok(message);
              broker.shutdown().then(() => {
                amqputils.assertMessageAbsent('q1', namespace, done);
              });
            });
          });
        });
      });
    });

    it('should not consume unacknowledged messages', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message) => {
              assert.ok(message);
              broker.shutdown().then(() => {
                amqputils.assertMessage('q1', namespace, 'test message', done);
              });
            });
          });
        });

        broker.on('error', (err) => {
          assert.strictEqual(err.code, 'ETIMEDOUT');
        });
      });
    });

    it('should consume acknowledged messages', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              assert.ok(message);
              ackOrNack();
              setTimeout(() => {
                broker.shutdown().then(() => {
                  amqputils.assertMessageAbsent('q1', namespace, done);
                });
              }, 100);
            });
          });
        });
      });
    });

    it('should consume rejected messages by default', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              assert.ok(message);
              ackOrNack(new Error('reject'));
              setTimeout(() => {
                broker.shutdown().then(() => {
                  amqputils.assertMessageAbsent('q1', namespace, done);
                });
              }, 100);
            });
          });
        });
      });
    });

    it('should reject messages when requested', (test, done) => {
      createBroker({
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
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              assert.ok(message);
              ackOrNack(new Error('reject'));
            });
          });

          broker.subscribe('s2').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              ackOrNack();
              done();
            });
          });
        });
      });
    });

    it('should requeue messages when requested', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          const messages = {};
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              assert.ok(message);
              messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
              if (messages[message.properties.messageId] < 10) return ackOrNack(new Error('retry'), { strategy: 'nack', requeue: true });
              ackOrNack();
              done();
            });
          });
        });
      });
    });

    it('should defer requeueing messages when requested', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          let numberOfMessages = 0;
          const startTime = new Date().getTime();
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              assert.ok(message);
              numberOfMessages++;
              if (numberOfMessages < 10) return ackOrNack(new Error('retry'), { strategy: 'nack', defer: 100, requeue: true });
              ackOrNack();
              const stopTime = new Date().getTime();
              assert.ok(stopTime - startTime >= 900, 'Retry was not deferred');
              done();
            });
          });
        });
      });
    });

    it('should count redeliveries', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions: {
          s1: {
            vhost: '/',
            queue: 'q1',
            redeliveries: {
              counter: 'inMemory',
            },
          },
        },
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          let errors = 0;
          broker.subscribe('s1').then((subscription) => {
            subscription
              .on('message', (message, content, ackOrNack) => {
                if (message.properties.headers.rascal.redeliveries < 10) throw new Error('oh no');
                ackOrNack();
                subscription.cancel().then(done);
              })
              .on('error', () => {
                if (errors++ > 10) done(new Error('Redeliveries were not counted'));
              });
          });
        });
      });
    });

    it('should notify when redeliveries limit is exceeded', (test, done) => {
      createBroker({
        vhosts,
        publications,
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
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          let errors = 0;
          broker.subscribe('s1').then((subscription) => {
            subscription
              .on('message', () => {
                throw new Error('oh no');
              })
              .on('redeliveries_exceeded', (err) => {
                assert(err);
                broker.shutdown().then(() => {
                  amqputils.assertMessage('q1', namespace, 'test message', done);
                });
              })
              .on('error', () => {
                if (errors++ > 5) done(new Error('Redeliveries were exceeded'));
              });
          });
        });

        broker.on('error', (err) => {
          assert.strictEqual(err.code, 'ETIMEDOUT');
        });
      });
    });

    it('should notify when redeliveries error is exceeded', (test, done) => {
      createBroker({
        vhosts,
        publications,
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
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          let errors = 0;
          broker.subscribe('s1').then((subscription) => {
            subscription
              .on('message', () => {
                throw new Error('oh no');
              })
              .on('redeliveries_error', (err) => {
                assert(err);
                broker.shutdown().then(() => {
                  amqputils.assertMessage('q1', namespace, 'test message', done);
                });
              })
              .on('error', () => {
                if (errors++ > 5) done(new Error('Redeliveries were exceeded'));
              });
          });
        });

        broker.on('error', (err) => {
          assert.strictEqual(err.code, 'ETIMEDOUT');
        });
      });
    });

    it('should consume a poison messages when no listener is bound', (test, done) => {
      createBroker({
        vhosts,
        publications,
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
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription
              .on('message', () => {
                throw new Error('oh no');
              })
              .on('error', (err) => {
                if (!/Message .* has exceeded 5 redeliveries/.test(err.message)) return;
                broker.shutdown().then(() => {
                  amqputils.assertMessageAbsent('q1', namespace, done);
                });
              });
          });
        });
      });
    });

    it('should consume a poison message when a listener acks it', (test, done) => {
      createBroker({
        vhosts,
        publications,
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
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            let errors = 0;
            subscription
              .on('message', () => {
                throw new Error('oh no');
              })
              .on('redeliveries_exceeded', (err, message, ackOrNack) => {
                assert(err);
                ackOrNack().then(() => {
                  setTimeout(() => {
                    broker.shutdown().then(() => {
                      amqputils.assertMessageAbsent('q1', namespace, done);
                    });
                  });
                });
              })
              .on('error', () => {
                if (errors++ > 5) done(new Error('Redeliveries were exceeded'));
              });
          });
        });
      });
    });

    it('should republish messages to queue when requested', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          const messages = {};
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              assert.ok(message);
              messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
              if (messages[message.properties.messageId] < 10) return ackOrNack({ message: 'republish me', code: 'red' }, { strategy: 'republish' });
              ackOrNack();
              assert.strictEqual(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].republished, 9);
              assert.strictEqual(message.properties.headers.rascal.error.message, 'republish me');
              assert.strictEqual(message.properties.headers.rascal.error.code, 'red');
              done();
            });
          });
        });
      });
    });

    it('should truncate error messages when republishing', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          const messages = {};
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              assert.ok(message);
              messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
              if (messages[message.properties.messageId] < 10) return ackOrNack(new Error(_.pad('x', 10000, 'x')), { strategy: 'republish' });
              ackOrNack();
              assert.strictEqual(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].republished, 9);
              assert.strictEqual(message.properties.headers.rascal.error.message.length, 1024);
              done();
            });
          });
        });
      });
    });

    it('should maintain original fields, properties and headers when republished', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker
          .publish('p1', 'test message', {
            options: { persistent: true, headers: { foo: 'bar' } },
          })
          .then((publication) => {
            publication.on('success', (messageId) => {
              const messages = {};
              broker.subscribe('s1').then((subscription) => {
                subscription.on('message', (message, content, ackOrNack) => {
                  assert.ok(message);
                  messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
                  if (messages[message.properties.messageId] < 2) return ackOrNack(new Error('republish'), { strategy: 'republish' });
                  ackOrNack();
                  assert.strictEqual(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].republished, 1);
                  assert.strictEqual(message.properties.headers.foo, 'bar');
                  assert.strictEqual(message.properties.messageId, messageId);
                  assert.strictEqual(message.fields.routingKey, 'foo');
                  assert.strictEqual(message.properties.deliveryMode, 2);
                  done();
                });
              });
            });
          });
      });
    });

    it('should cap republishes when requested', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message');

        let count = 0;
        broker.subscribe('s1').then((subscription) => {
          subscription.on('message', (message, content, ackOrNack) => {
            count++;
            ackOrNack(new Error('republish'), {
              strategy: 'republish',
              attempts: 5,
            });
          });
        });

        setTimeout(() => {
          assert.strictEqual(count, 6);
          done();
        }, 500);
      });
    });

    it('should defer republishing messages when requested', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          let numberOfMessages = 0;
          const startTime = new Date().getTime();
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              assert.ok(message);
              numberOfMessages++;
              if (numberOfMessages < 10) return ackOrNack(new Error('republish'), { strategy: 'republish', defer: 100 });
              ackOrNack();
              const stopTime = new Date().getTime();
              assert.ok(stopTime - startTime >= 900, 'Republish was not deferred');
              done();
            });
          });
        });
      });
    });

    it('should immediately nack republished messages when requested', (test, done) => {
      createBroker({
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
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            let count = 0;
            subscription.on('message', (message, content, ackOrNack) => {
              assert.strictEqual(++count, 1);
              assert.ok(message);
              ackOrNack(new Error('immediate nack'), { strategy: 'republish', immediateNack: true });
            });
          });

          broker.subscribe('s2').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              ackOrNack();
              done();
            });
          });
        });
      });
    });

    it('should forward messages to publication when requested', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message');

        broker.subscribe('s1').then((subscription) => {
          subscription.on('message', (message, content, ackOrNack) => {
            assert.ok(message);
            ackOrNack({ message: 'forward me', code: 'red' }, { strategy: 'forward', publication: 'p2' });
          });
        });

        broker.subscribe('s2').then((subscription) => {
          subscription.on('message', (message, content, ackOrNack) => {
            assert.ok(message);
            ackOrNack();
            assert.strictEqual(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1);
            assert.strictEqual(message.properties.headers.CC.length, 1);
            assert.strictEqual(message.properties.headers.CC[0], `${broker.qualify('/', 'q1')}.bar`);
            assert.strictEqual(message.properties.headers.rascal.error.message, 'forward me');
            assert.strictEqual(message.properties.headers.rascal.error.code, 'red');
            done();
          });
        });
      });
    });

    it('should truncate error messages when forwarding', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message');

        broker.subscribe('s1').then((subscription) => {
          subscription.on('message', (message, content, ackOrNack) => {
            assert.ok(message);
            ackOrNack(new Error(_.pad('x', 10000, 'x')), {
              strategy: 'forward',
              publication: 'p2',
            });
          });
        });

        broker.subscribe('s2').then((subscription) => {
          subscription.on('message', (message, content, ackOrNack) => {
            assert.ok(message);
            ackOrNack();
            assert.strictEqual(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1);
            assert.strictEqual(message.properties.headers.rascal.error.message.length, 1024);
            done();
          });
        });
      });
    });

    it('should override routing key when forwarding messages', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message');

        broker.subscribe('s1').then((subscription) => {
          subscription.on('message', (message, content, ackOrNack) => {
            assert.ok(message);
            ackOrNack(new Error('forward'), {
              strategy: 'forward',
              publication: 'p1',
              options: { routingKey: 'baz' },
            });
          });
        });

        broker.subscribe('s3').then((subscription) => {
          subscription.on('message', (message, content, ackOrNack) => {
            assert.ok(message);
            ackOrNack();
            assert.strictEqual(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1);
            done();
          });
        });
      });
    });

    it('should maintain original fields, properties and headers when forwarding messages', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        let messageId;

        broker
          .publish('p1', 'test message', {
            options: { headers: { foo: 'bar' } },
          })
          .then((publication) => {
            publication.on('success', (_messageId) => {
              messageId = _messageId;
            });
          });

        broker.subscribe('s1').then((subscription) => {
          subscription.on('message', (message, content, ackOrNack) => {
            assert.ok(message);
            ackOrNack(new Error('forward'), {
              strategy: 'forward',
              publication: 'p2',
            });
          });
        });

        broker.subscribe('s2').then((subscription) => {
          subscription.on('message', (message, content, ackOrNack) => {
            assert.ok(message);
            ackOrNack();
            assert.strictEqual(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1);
            assert.strictEqual(message.properties.headers.foo, 'bar');
            assert.strictEqual(message.properties.messageId, messageId);
            assert.strictEqual(message.fields.routingKey, 'foo');
            done();
          });
        });
      });
    });

    it('should not maintain original routing headers when requested', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        let messageId;

        broker
          .publish('p1', 'test message', {
            options: { headers: { foo: 'bar' } },
          })
          .then((publication) => {
            publication.on('success', (_messageId) => {
              messageId = _messageId;
            });
          });

        broker.subscribe('s1').then((subscription) => {
          subscription.on('message', (message, content, ackOrNack) => {
            assert.ok(message);
            ackOrNack(new Error('forward'), {
              strategy: 'forward',
              publication: 'p2',
              restoreRoutingHeaders: false,
            });
          });
        });

        broker.subscribe('s2').then((subscription) => {
          subscription.on('message', (message, content, ackOrNack) => {
            assert.ok(message);
            ackOrNack();
            assert.strictEqual(message.properties.headers.rascal.recovery[broker.qualify('/', 'q1')].forwarded, 1);
            assert.strictEqual(message.properties.headers.foo, 'bar');
            assert.strictEqual(message.properties.messageId, messageId);
            assert.strictEqual(message.fields.routingKey, 'bar');
            done();
          });
        });
      });
    });

    it('should cap forwards when requested', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message');

        let count = 0;

        broker.subscribe('s1').then((subscription) => {
          subscription.on('message', (message, content, ackOrNack) => {
            assert.ok(message);
            count++;
            ackOrNack(new Error('forward'), {
              strategy: 'forward',
              publication: 'p1',
              attempts: 5,
            });
          });
        });

        setTimeout(() => {
          assert.strictEqual(count, 6);
          done();
        }, 500);
      });
    });

    it('should error when forwarding messages to /dev/null', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then((publication) => {
          publication.on('success', (messageId) => {
            broker.subscribe('s1').then((subscription) => {
              subscription.on('message', (message, content, ackOrNack) => {
                assert.ok(message);
                ackOrNack(new Error('forward'), {
                  strategy: 'forward',
                  publication: 'p3',
                }).catch((err) => {
                  assert.ok(err);
                  assert.strictEqual(`Message: ${messageId} was forwarded to publication: p3, but was returned`, err.message);
                  done();
                });
              });
            });
          });
        });
      });
    });

    it('should error on unknown recovery strategy', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then((publication) => {
          publication.on('success', (messageId) => {
            broker.subscribe('s1').then((subscription) => {
              subscription.on('message', (message, content, ackOrNack) => {
                assert.ok(message);
                ackOrNack(new Error('unknown'), { strategy: 'foo' }).catch((err) => {
                  assert.ok(err);
                  assert.strictEqual(`Error recovering message: ${messageId}. No such strategy: foo.`, err.message);
                  done();
                });
              });
            });
          });
        });
      });
    });

    it('should chain recovery strategies', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          const messages = {};
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              assert.ok(message);
              ackOrNack(new Error('retry'), [{ strategy: 'republish', attempts: 5 }, { strategy: 'ack' }]).then(() => {
                messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
                if (messages[message.properties.messageId] < 6) return;
                setTimeout(() => {
                  assert.strictEqual(messages[message.properties.messageId], 6);
                  done();
                }, 500);
              });
            });
          });
        });
      });
    });

    it('should not rollback message when shutting down broker after ack', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          const messages = {};
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              assert.ok(message);
              messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
              ackOrNack().then(() => {
                broker.shutdown().then(() => {
                  amqputils.assertMessageAbsent('q1', namespace, done);
                });
              });
            });
          });
        });
      });
    });

    it('should not rollback message when shutting down broker after ack', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          const messages = {};
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              assert.ok(message);
              messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
              ackOrNack(new Error('Oh Noes'), [{ strategy: 'ack' }]).then(() => {
                broker.shutdown().then(() => {
                  amqputils.assertMessageAbsent('q1', namespace, done);
                });
              });
            });
          });
        });
      });
    });

    it('should nack messages when all recovery strategies have been attempted', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          const messages = {};
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              assert.ok(message);
              messages[message.properties.messageId] = messages[message.properties.messageId] ? messages[message.properties.messageId] + 1 : 1;
              ackOrNack(new Error('retry'), []).then(() => {
                broker.shutdown().then(() => {
                  amqputils.assertMessageAbsent('q1', namespace, done);
                });
              });
            });
          });
        });
      });
    });

    it('should limit concurrent messages using prefetch', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions: {
          s1: {
            vhost: '/',
            queue: 'q1',
            prefetch: 5,
          },
        },
      }).then((broker) => {
        const promises = new Array(10).fill().map(() => {
          return broker.publish('p1', 'test message');
        });

        Promise.all(promises).then(() => {
          const messages = [];
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              assert(message);
              messages.push(ackOrNack);
              if (messages.length === 5) {
                setTimeout(() => {
                  assert.strictEqual(messages.length, 5);
                  subscription.cancel().then(done);
                  setTimeout(() => {
                    messages.forEach((ackOrNack) => ackOrNack());
                  }, 1);
                }, 500);
              }
            });
          });
        });
      });
    });

    it('should emit channel errors', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1', { retry: false }).then((subscription) => {
            subscription
              .on('message', (message, content, ackOrNack) => {
                ackOrNack();
                ackOrNack(); // trigger a channel error
              })
              .on('error', (err) => {
                assert.ok(err);
                assert.strictEqual('Channel closed by server: 406 (PRECONDITION-FAILED) with message "PRECONDITION_FAILED - unknown delivery tag 1"', err.message);
                done();
              });
          });
        });
      });
    });

    it('should not consume messages after unsubscribing', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions: {
          s1: {
            vhost: '/',
            queue: 'q1',
            options: {
              noAck: true,
            },
          },
        },
      }).then((broker) => {
        broker.subscribe('s1').then((subscription) => {
          subscription.on('message', () => {
            assert.ok(false, 'Should not receive messages after unsubscribing');
          });

          subscription.cancel().then(() => {
            broker.publish('p1', 'test message').then(() => {
              setTimeout(done, 500);
            });
          });
        });
      });
    });

    it('should tollerate repeated unsubscription', () => {
      return createBroker({
        vhosts,
        publications,
        subscriptions: {
          s1: {
            vhost: '/',
            queue: 'q1',
            options: {
              noAck: true,
            },
          },
        },
      }).then((broker) => {
        return broker.subscribe('s1').then((subscription) => {
          const promises = new Array(3).fill().map(() => {
            return subscription.cancel();
          });
          return Promise.all(promises);
        });
      });
    });

    it('should not warn about emitter leaks', () => {
      const config = {
        vhosts,
        publications,
        subscriptions: {},
      };

      const times = new Array(11).fill();

      times.forEach((__, i) => {
        config.subscriptions[`s${i}`] = {
          vhost: '/',
          queue: 'q1',
          options: {
            noAck: true,
          },
        };
      });

      return createBroker(config).then((broker) => {
        const promises = times.map((__, i) => {
          return broker.subscribe(`s${i}`);
        });
        return Promise.all(promises);
      });
    });

    it('should attach the subscription vhost to message properties', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions,
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              ackOrNack();
              assert.strictEqual(message.properties.headers.rascal.originalVhost, '/');
              done();
            });
          });
        });
      });
    });

    it('should emit an error if trying to ack a message after unsubscribing', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions: _.defaultsDeep({}, subscriptions, {
          s1: { closeTimeout: 100 },
        }),
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              subscription.cancel().catch((err) => {
                assert.strictEqual(err.code, 'ETIMEDOUT');
                setTimeout(() => {
                  ackOrNack().catch((err) => {
                    assert.strictEqual(err.message, 'The channel has been closed. Unable to ack message');
                    done();
                  });
                }, 200);
              });
            });
          });
        });
      });
    });

    it('should emit an error if trying to nack a message after unsubscribing', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions: _.defaultsDeep({}, subscriptions, {
          s1: { closeTimeout: 100 },
        }),
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              subscription.cancel().catch((err) => {
                assert.strictEqual(err.code, 'ETIMEDOUT');
                setTimeout(() => {
                  ackOrNack(new Error('Oh Noes!')).catch((err) => {
                    assert.strictEqual(err.message, 'The channel has been closed. Unable to nack message');
                    done();
                  });
                }, 200);
              });
            });
          });
        });
      });
    });

    it('should symetrically decrypt messages', (test, done) => {
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
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription.on('message', (message, content, ackOrNack) => {
              ackOrNack();
              assert.strictEqual(message.properties.contentType, 'application/octet-stream');
              assert.strictEqual(content, 'test message');
              done();
            });
          });
        });
      });
    });

    it('should report invalid_content when missing encryption profile', (test, done) => {
      createBroker({
        vhosts,
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
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription
              .on('message', () => {
                assert.ok(false, 'Message should not have been delivered');
              })
              .on('invalid_content', (err, message, ackOrNack) => {
                ackOrNack();
                assert.strictEqual(err.message, 'Unknown encryption profile: not-well-known');
                done();
              });
          });
        });
      });
    });

    it('should fail with invalid content when encryption errors', (test, done) => {
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
      }).then((broker) => {
        broker.publish('p1', 'test message').then(() => {
          broker.subscribe('s1').then((subscription) => {
            subscription
              .on('message', () => {
                assert.ok(false, 'Message should not have been delivered');
              })
              .on('invalid_content', (err, message, ackOrNack) => {
                ackOrNack();
                assert.strictEqual(err.message, 'Invalid key length');
                done();
              });
          });
        });
      });
    });

    it('should support ackOrNack using callbacks', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions: {
          s1: {
            vhost: '/',
            queue: 'q1',
            promisifyAckOrNack: false,
          },
        },
      }).then((broker) => {
        broker.publish('p1', 'test message').then((publication) => {
          publication.on('success', () => {
            broker.subscribe('s1').then((subscription) => {
              subscription.on('message', (message, content, ackOrNack) => {
                assert.ok(message);
                ackOrNack(done);
              });
            });
          });
        });
      });
    });

    it('should support handling recovery errors using callbacks', (test, done) => {
      createBroker({
        vhosts,
        publications,
        subscriptions: {
          s1: {
            vhost: '/',
            queue: 'q1',
            promisifyAckOrNack: false,
          },
        },
      }).then((broker) => {
        broker.publish('p1', 'test message').then((publication) => {
          publication.on('success', (messageId) => {
            broker.subscribe('s1').then((subscription) => {
              subscription.on('message', (message, content, ackOrNack) => {
                assert.ok(message);
                ackOrNack(new Error('unknown'), { strategy: 'foo' }, (err) => {
                  assert.ok(err);
                  assert.strictEqual(`Error recovering message: ${messageId}. No such strategy: foo.`, err.message);
                  done();
                });
              });
            });
          });
        });
      });
    });

    function createBroker(config) {
      config = _.defaultsDeep(config, testConfig, {
        defaults: { subscriptions: { promisifyAckOrNack: true } },
      });
      return BrokerAsPromised.create(config)
        .catch((err) => {
          if (err.broker) broker = err[err.broker];
          throw err;
        })
        .then((_broker) => {
          broker = _broker;
          return broker;
        });
    }
  },
  { timeout: 5000 }
);
