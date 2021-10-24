const debug = require('debug')('rascal:tasks:deleteQueues');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachSeries(
    _.keys(config.queues),
    (name, callback) => {
      deleteQueue(ctx.channel, config.queues[name], callback);
    },
    (err) => {
      next(err, config, ctx);
    }
  );
});

function deleteQueue(channel, config, next) {
  debug('Deleting queue: %s', config.fullyQualifiedName);
  channel.deleteQueue(config.fullyQualifiedName, {}, next);
}
