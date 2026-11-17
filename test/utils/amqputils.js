const http = require('http');
const assert = require('assert');
const _ = require('lodash');
const async = require('async');

module.exports = {
  init,
};

function init(connection) {
  function disconnect(next) {
    connection.close(next);
  }

  // RabbitMQ 4.3+ disables global (per-channel) QoS by default
  function supportsGlobalQos() {
    const [major, minor] = String(connection.connection.serverProperties.version).split('.').map(Number);
    return major < 4 || (major === 4 && minor < 3);
  }

  function checkExchange(present, name, namespace, next) {
    connection.createChannel((err, channel) => {
      assert.ifError(err);
      channel.checkExchange(`${namespace}:${name}`, (err) => {
        present ? assert(!err) : assert(!!err);
        next();
      });
    });
  }

  function createQueue(name, namespace, next) {
    connection.createChannel((err, channel) => {
      assert.ifError(err);
      channel.assertQueue(`${namespace}:${name}`, {}, (err) => {
        assert.ifError(err);
        next();
      });
    });
  }

  function checkQueue(present, name, namespace, next) {
    connection.createChannel((err, channel) => {
      assert.ifError(err);
      channel.checkQueue(`${namespace}:${name}`, (err) => {
        present ? assert(!err) : assert(!!err);
        next();
      });
    });
  }

  function deleteQueue(name, namespace, next) {
    connection.createChannel((err, channel) => {
      assert.ifError(err);
      channel.deleteQueue(`${namespace}:${name}`, next);
    });
  }

  function publishMessage(exchange, namespace, message, options, next) {
    _publishMessage(`${namespace}:${exchange}`, message, options, next);
  }

  function publishMessageToQueue(queue, namespace, message, options, next) {
    options.routingKey = `${namespace}:${queue}`;
    _publishMessage('', message, options, next);
  }

  function _publishMessage(fqExchange, message, options, next) {
    connection.createChannel((err, channel) => {
      assert.ifError(err);
      channel.publish(fqExchange, options.routingKey, Buffer.from(message), options);
      next && next();
    });
  }

  function getMessage(queue, namespace, next) {
    connection.createChannel((err, channel) => {
      assert.ifError(err);
      channel.get(`${namespace}:${queue}`, { noAck: true }, (err, message) => {
        if (err) return next(err);
        next(null, message);
      });
    });
  }

  function assertMessage(queue, namespace, expected, next) {
    getMessage(queue, namespace, (err, message) => {
      assert.ifError(err);
      assert.ok(message, 'Message was not present');
      assert.strictEqual(message.content.toString(), expected);
      next();
    });
  }

  function assertMessageAbsent(queue, namespace, next) {
    getMessage(queue, namespace, (err, message) => {
      assert.ifError(err);
      assert.ok(!message, 'Message was present');
      next();
    });
  }

  // The management API only refreshes its connection list every statistics interval (5s by default),
  // so it can still list connections from earlier tests. Wait for the one with the given connection_name.
  function waitForConnections(connectionName, next) {
    let connections = [];
    let attempts = 0;
    async.whilst(
      (cb) => {
        cb(null, attempts < 200 && connections.length === 0);
      },
      (cb) => {
        setTimeout(() => {
          attempts++;
          fetchConnections((err, _connections) => {
            if (err) return cb(err);
            connections = _connections.filter((connection) => connection.user_provided_name === connectionName);
            cb(null, connections);
          });
        }, 100);
      },
      next,
    );
  }

  function fetchConnections(next) {
    http.get('http://guest:guest@localhost:15672/api/connections', (response) => {
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      }).on('end', () => {
        next(null, JSON.parse(data));
      });
    }).on('error', next).end();
  }

  function closeConnections(connections, reason, next) {
    async.each(connections, (connection, cb) => {
      closeConnection(connection.name, reason, cb);
    }, next);
  }

  function closeConnection(name, reason, next) {
    const headers = {
      'x-reason': reason,
      connection: 'close',
    };
    http.request(`http://guest:guest@localhost:15672/api/connections/${encodeURIComponent(name)}`, { method: 'delete', headers }, () => {
      next();
    }).on('error', next).end();
  }

  return {
    disconnect,
    supportsGlobalQos,
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
    closeConnections,
    waitForConnections,
  };
}
