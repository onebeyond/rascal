const debug = require('debug')('rascal:tasks:checkExchanges');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachOfLimit(
    _.keys(config.exchanges),
    config.concurrency,
    (name, index, cb) => {
      const channel = ctx.channels[index % config.concurrency];
      checkExchange(channel, config.exchanges[name], cb);
    },
    (err) => {
      next(err, config, ctx);
    }
  );
});

function checkExchange(channel, config, next) {
  if (!config.check) return next();
  debug('Checking exchange: %s', config.fullyQualifiedName);
  channel.checkExchange(config.fullyQualifiedName, next);
}
