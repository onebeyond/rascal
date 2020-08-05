var assert = require('assert');
var _ = require('lodash');
// var async = require('async');
var amqplib = require('amqplib/callback_api');
var testConfig = require('../lib/config/tests');
// var format = require('util').format;
var uuid = require('uuid').v4;
var BrokerAsPromised = require('..').BrokerAsPromised;
var AmqpUtils = require('./utils/amqputils');

describe.only('Repliable publications', function() {
  this.timeout(2000);
  this.slow(1000);

  var broker;
  var amqputils;
  var namespace;
  var vhosts;

  beforeEach(function(done) {

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

  afterEach(function() {
    if (broker) return broker.nuke();
  });

  it.only('should enable replying to a repliable message', function(done) {
    createBroker({
      vhosts: vhosts,
      publications: {
        p1: {
          queue: 'q1',
          repliable: true,
        },
      },
      subscriptions: {
        s1: {
          queue: 'q1',
        },
      },
    }).then(function(broker) {
      broker.subscribe('s1')
        .then((subscription) => {
          subscription.on('message', (message, content, ackOrNack) => {
            return Promise.resolve()
              .then(() => ackOrNack())
              .then(() => {
                const { replyTo, messageId } = message.properties;
                return broker.publish(
                  '/',
                  { outcome: 'success' },
                  { routingKey: replyTo, options: { correlationId: messageId } }
                );
              });
          });

          broker.publish('p1', 'repliable message')
            .then((publication) => {
              publication.replies.on('message', (msg, content) => {
                assert.equal(content.outcome, 'success');
                return done();
              });
            })
            .catch(done);
        })
        .catch(done);
    });
  });

  it('should not enable replying to a non-repliable message');

  function createBroker(config, next) {
    config = _.defaultsDeep(config, testConfig);
    return BrokerAsPromised.create(config).then(function(_broker) {
      broker = _broker;
      return broker;
    });
  }
});
