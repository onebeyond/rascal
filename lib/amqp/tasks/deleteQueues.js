const debug = require('debug')('rascal:tasks:deleteQueues');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachOfLimit(
    _.keys(config.queues),
    config.concurrency,
    (name, index, cb) => {
      const channel = ctx.channels[index % config.concurrency];
      deleteQueue(channel, config.queues[name], cb);
    },
    (err) => {
      next(err, config, ctx);
    },
  );
});

function deleteQueue(channel, config, next) {
  debug('Deleting queue: %s', config.fullyQualifiedName);
  channel.deleteQueue(config.fullyQualifiedName, {}, next);
}
