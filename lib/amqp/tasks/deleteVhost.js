const debug = require('debug')('rascal:tasks:deleteVhost');
const _ = require('lodash');
const async = require('async');
const Client = require('../../management/Client');

module.exports = _.curry((config, ctx, next) => {
  const vhostConfig = config.vhosts[ctx.vhost.name];
  if (!vhostConfig.assert) return next(null, config, ctx);

  const candidates = vhostConfig.connections;
  const client = new Client(ctx.components.agent);

  async.retry(
    candidates.length,
    (cb) => {
      const connectionConfig = candidates[ctx.vhost.connectionIndex];
      client.deleteVhost(vhostConfig.name, connectionConfig.management, (err) => {
        if (err) {
          ctx.vhost.connectionIndex = (ctx.vhost.connectionIndex + 1) % candidates.length;
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
