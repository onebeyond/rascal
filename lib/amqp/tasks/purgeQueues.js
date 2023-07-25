const debug = require('debug')('rascal:tasks:purgeQueues');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachOfLimit(
    _.keys(config.queues),
    config.concurrency,
    (name, index, cb) => {
      const channel = ctx.channels[index % config.concurrency];
      purgeQueue(channel, config.queues[name], ctx, cb);
    },
    (err) => {
      next(err, config, ctx);
    },
  );
});

function purgeQueue(channel, config, ctx, next) {
  if (!config.purge && !ctx.purge) return next();
  debug('Purging queue: %s', config.fullyQualifiedName);
  channel.purgeQueue(config.fullyQualifiedName, next);
}
