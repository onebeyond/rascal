const debug = require('debug')('rascal:tasks:checkQueues');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachOfLimit(
    _.keys(config.queues),
    config.concurrency,
    (name, index, cb) => {
      const channel = ctx.channels[index % config.concurrency];
      checkQueue(channel, config.queues[name], cb);
    },
    (err) => {
      next(err, config, ctx);
    },
  );
});

function checkQueue(channel, config, next) {
  if (!config.check) return next();
  debug('Checking queue: %s', config.fullyQualifiedName);
  channel.checkQueue(config.fullyQualifiedName, next);
}
