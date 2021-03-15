const assert = require('assert');
const _ = require('lodash');

module.exports = {
  init,
};

function init(connection) {

  function disconnect(next) {
    connection.close(next);
  }

  function checkExchange(present, name, namespace, next) {
    connection.createChannel(function(err, channel) {
      assert.ifError(err);
      channel.checkExchange(namespace + ':' + name, function(err) {
        present ? assert(!err) : assert(!!err);
        next();
      });
    });
  }

  function createQueue(name, namespace, next) {
    connection.createChannel(function(err, channel) {
      assert.ifError(err);
      channel.assertQueue(namespace + ':' + name, {}, function(err) {
        assert.ifError(err);
        next();
      });
    });
  }

  function checkQueue(present, name, namespace, next) {
    connection.createChannel(function(err, channel) {
      assert.ifError(err);
      channel.checkQueue(namespace + ':' + name, function(err) {
        present ? assert(!err) : assert(!!err);
        next();
      });
    });
  }

  function deleteQueue(name, namespace, next) {
    connection.createChannel(function(err, channel) {
      assert.ifError(err);
      channel.deleteQueue(namespace + ':' + name, next);
    });
  }

  function publishMessage(exchange, namespace, message, options, next) {
    _publishMessage(namespace + ':' + exchange, message, options, next);
  }

  function publishMessageToQueue(queue, namespace, message, options, next) {
    options.routingKey = namespace + ':' + queue;
    _publishMessage('', message, options, next);
  }

  function _publishMessage(fqExchange, message, options, next) {
    connection.createChannel(function(err, channel) {
      assert.ifError(err);
      channel.publish(fqExchange, options.routingKey, Buffer.from(message), options);
      next && next();
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
    disconnect,
    checkExchange: _.curry(checkExchange),
    createQueue,
    checkQueue: _.curry(checkQueue),
    deleteQueue,
    publishMessage: _.curry(publishMessage),
    publishMessageToQueue,
    getMessage: _.curry(getMessage),
    assertMessage: _.curry(assertMessage),
    assertMessageAbsent: _.curry(assertMessageAbsent),
    assertExchangePresent: checkExchange.bind(null, true),
    assertExchangeAbsent: checkExchange.bind(null, false),
    assertQueuePresent: checkQueue.bind(null, true),
    assertQueueAbsent: checkQueue.bind(null, false),
  };
}
