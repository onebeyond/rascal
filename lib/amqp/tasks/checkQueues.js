const debug = require('debug')('rascal:tasks:checkQueues');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachSeries(
    _.keys(config.queues),
    (name, callback) => {
      checkQueue(ctx.channel, config.queues[name], callback);
    },
    (err) => {
      next(err, config, ctx);
    }
  );
});

function checkQueue(channel, config, next) {
  if (!config.check) return next();
  debug('Checking queue: %s', config.fullyQualifiedName);
  channel.checkQueue(config.fullyQualifiedName, next);
}
