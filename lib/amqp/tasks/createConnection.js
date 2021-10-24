const debug = require('debug')('rascal:tasks:createConnection');
const _ = require('lodash');
const amqplib = require('amqplib/callback_api');
const async = require('async');
const format = require('util').format;
const uuid = require('uuid').v4;

module.exports = _.curry((config, ctx, next) => {
  const candidates = config.connections;

  async.retry(
    candidates.length,
    (cb) => {
      const connectionConfig = candidates[ctx.connectionIndex];
      connect(connectionConfig, (err, connection) => {
        if (err) {
          ctx.connectionIndex = (ctx.connectionIndex + 1) % candidates.length;
          return cb(err);
        }
        ctx.connection = connection;
        ctx.connectionConfig = connectionConfig;
        cb();
      });
    },
    (err) => {
      next(err, config, ctx);
    }
  );
});

function connect(connectionConfig, cb) {
  debug('Connecting to broker using url: %s', connectionConfig.loggableUrl);

  // See https://github.com/guidesmiths/rascal/issues/17
  const once = _.once(cb);
  let invocations = 0;

  amqplib.connect(connectionConfig.url, connectionConfig.socketOptions, (err, connection) => {
    invocations++;

    if (err) {
      const betterMessage = format('Failed to connect to: %s. Original message was:', connectionConfig.loggableUrl, err.message);
      err.message = betterMessage;
      return once(err);
    }

    connection._rascal_id = uuid();
    debug('Obtained connection: %s', connection._rascal_id);

    /*
     * If an error occurs during initialisation (e.g. if checkExchanges fails),
     * and no error handler has been bound to the connection, then the error will bubble up
     * to the UncaughtException handler, potentially crashing the node process.
     *
     * By adding an error handler now, we ensure that instead of being emitted as events
     * errors will be passed via the callback chain, so they can still be handled by the caller
     *
     * This error handle is removed in the vhost after the initialiation has complete
     */
    connection.on('error', (err) => {
      debug('Received error: %s from %s', err.message, connectionConfig.loggableUrl);
      once(err);
    });

    // See https://github.com/squaremo/amqp.node/issues/388
    if (invocations > 1) {
      debug('Closing superfluous connection: %s previously reported as errored', connection._rascal_id);
      return connection.close();
    }

    connection.setMaxListeners(0);

    once(null, connection);
  });
}
