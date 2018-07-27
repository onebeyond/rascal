var assert = require('assert');
var _ = require('lodash');

module.exports = {
  init: init,
};

function init(connection) {

  function checkExchange(present, name, namespace, next) {
    connection.createChannel(function(err, channel) {
      assert.ifError(err);
      channel.checkExchange(namespace + ':' + name, function(err, ok) {
        present ? assert(!err) : assert(!!err);
        next();
      });
    });
  }

  function checkQueue(present, name, namespace, next) {
    connection.createChannel(function(err, channel) {
      assert.ifError(err);
      channel.checkQueue(namespace + ':' + name, function(err, ok) {
        present ? assert(!err) : assert(!!err);
        next();
      });
    });
  }

  function publishMessage(exchange, namespace, message, options, next) {
    connection.createChannel(function(err, channel) {
      assert.ifError(err);
      channel.publish(namespace + ':' + exchange, options.routingKey, new Buffer(message), options);
      next();
    });
  }

  function getMessage(queue, namespace, next) {
    connection.createChannel(function(err, channel) {
      assert.ifError(err);
      channel.get(namespace + ':' + queue, { noAck: true }, function(err, message) {
        if (err) return next(err);
        next(null, message);
      });
    });
  }

  function assertMessage(queue, namespace, expected, next) {
    getMessage(queue, namespace, function(err, message) {
      assert.ifError(err);
      assert.ok(message, 'Message was not present');
      assert.equal(message.content.toString(), expected);
      next();
    });
  }

  function assertMessageAbsent(queue, namespace, next) {
    getMessage(queue, namespace, function(err, message) {
      assert.ifError(err);
      assert.ok(!message, 'Message was present');
      next();
    });
  }

  return {
    checkExchange: _.curry(checkExchange),
    checkQueue: _.curry(checkQueue),
    publishMessage: _.curry(publishMessage),
    getMessage: _.curry(getMessage),
    assertMessage: _.curry(assertMessage),
    assertMessageAbsent: _.curry(assertMessageAbsent),
    assertExchangePresent: checkExchange.bind(null, true),
    assertExchangeAbsent: checkExchange.bind(null, false),
    assertQueuePresent: checkQueue.bind(null, true),
    assertQueueAbsent: checkQueue.bind(null, false),
  };
}
