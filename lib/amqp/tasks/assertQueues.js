const debug = require('debug')('rascal:tasks:assertQueues');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachOfLimit(
    _.keys(config.queues),
    config.concurrency,
    (name, index, cb) => {
      const channel = ctx.channels[index % config.concurrency];
      assertQueue(channel, config.queues[name], cb);
    },
    (err) => {
      next(err, config, ctx);
    },
  );
});

function assertQueue(channel, config, next) {
  if (!config.assert) return next();
  debug('Asserting queue: %s', config.fullyQualifiedName);
  channel.assertQueue(config.fullyQualifiedName, config.options, next);
}
