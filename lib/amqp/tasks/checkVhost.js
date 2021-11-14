const debug = require('debug')('rascal:tasks:checkVhost');
const _ = require('lodash');
const async = require('async');
const Client = require('../../management/Client');

module.exports = _.curry((config, ctx, next) => {
  if (!config.check) return next(null, config, ctx);

  const candidates = config.connections;
  const client = new Client(ctx.components.agent);

  async.retry(
    candidates.length,
    (cb) => {
      const connectionConfig = candidates[ctx.connectionIndex];
      client.checkVhost(config.name, connectionConfig.management, (err) => {
        if (err) {
          ctx.connectionIndex = (ctx.connectionIndex + 1) % candidates.length;
          return cb(err);
        }
        ctx.connectionConfig = connectionConfig;
        cb();
      });
    },
    (err) => {
      next(err, config, ctx);
    }
  );
});
