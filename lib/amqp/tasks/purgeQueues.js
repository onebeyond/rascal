const debug = require('debug')('rascal:tasks:purgeQueues');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachSeries(
    _.keys(config.queues),
    (name, callback) => {
      purgeQueue(ctx.channel, config.queues[name], ctx, callback);
    },
    (err) => {
      next(err, config, ctx);
    }
  );
});

function purgeQueue(channel, config, ctx, next) {
  if (!config.purge && !ctx.purge) return next();
  debug('Purging queue: %s', config.fullyQualifiedName);
  channel.purgeQueue(config.fullyQualifiedName, next);
}
