const debug = require('debug')('rascal:tasks:assertQueues');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachSeries(
    _.keys(config.queues),
    (name, callback) => {
      assertQueue(ctx.channel, config.queues[name], callback);
    },
    (err) => {
      next(err, config, ctx);
    }
  );
});

function assertQueue(channel, config, next) {
  if (!config.assert) return next();
  debug('Asserting queue: %s', config.fullyQualifiedName);
  channel.assertQueue(config.fullyQualifiedName, config.options, next);
}
