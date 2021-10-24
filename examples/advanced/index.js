var Rascal = require('../..');
var config = require('./config');
var _ = require('lodash');
var Chance = require('Chance');
var chance = new Chance();
var format = require('util').format;

Rascal.Broker.create(Rascal.withDefaultConfig(config.rascal), function (err, broker) {
  if (err) bail(err);

  broker.on('error', function (err) {
    console.error(err.message);
  });

  _.each(broker.config.subscriptions, function (subscriptionConfig, subscriptionName) {
    if (!subscriptionConfig.handler) return;

    var handler = require('./handlers/' + subscriptionConfig.handler)(broker);

    broker.subscribe(subscriptionName, function (err, subscription) {
      if (err) return bail(err);
      subscription
        .on('message', function (message, content, ackOrNack) {
          handler(content, function (err) {
            if (!err) return ackOrNack();
            console.log(err);
            ackOrNack(err, err.recoverable ? broker.config.recovery.deferred_retry : broker.config.recovery.dead_letter);
          });
        })
        .on('invalid_content', function (err, message, ackOrNack) {
          console.error('Invalid Content', err.message);
          ackOrNack(err, broker.config.recovery.dead_letter);
        })
        .on('redeliveries_exceeded', function (err, message, ackOrNack) {
          console.error('Redeliveries Exceeded', err.message);
          ackOrNack(err, broker.config.recovery.dead_letter);
        })
        .on('cancel', function (err) {
          console.warn(err.message);
        })
        .on('error', function (err) {
          console.error(err.message);
        });
    });
  });

  // Simulate a web app handling user registrations
  setInterval(function () {
    var user = {
      username: chance.first() + '_' + chance.last(),
      crash: randomInt(10) === 10,
    };
    var events = { 1: 'created', 2: 'updated', 3: 'deleted' };
    var event = events[randomInt(3)];
    var routingKey = format('registration_webapp.user.%s.%s', event, user.username);

    broker.publish('user_event', user, routingKey, function (err, publication) {
      if (err) return console.log(err.message);
      publication
        .on('success', function () {
          // confirmed
        })
        .on('error', function (err) {
          console.error(err.message);
        });
    });
  }, 1000);

  process
    .on('SIGINT', function () {
      broker.shutdown(function () {
        process.exit();
      });
    })
    .on('SIGTERM', () => {
      broker.shutdown(function () {
        process.exit();
      });
    })
    .on('unhandledRejection', (reason, p) => {
      console.error(reason, 'Unhandled Rejection at Promise', p);
      broker.shutdown(function () {
        process.exit(-1);
      });
    })
    .on('uncaughtException', (err) => {
      console.error(err, 'Uncaught Exception thrown');
      broker.shutdown(function () {
        process.exit(-2);
      });
    });
});

function randomInt(max) {
  return Math.floor(Math.random() * max) + 1;
}

function bail(err) {
  console.error(err);
  process.exit(1);
}
