const debug = require('debug')('rascal:tasks:assertExchanges');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachOfLimit(
    _.keys(config.exchanges),
    config.concurrency,
    (name, index, cb) => {
      const channel = ctx.channels[index % config.concurrency];
      assertExchange(channel, config.exchanges[name], cb);
    },
    (err) => {
      next(err, config, ctx);
    }
  );
});

function assertExchange(channel, config, next) {
  if (!config.assert) return next();
  if (config.fullyQualifiedName === '') return next();
  debug('Asserting exchange: %s', config.fullyQualifiedName);
  channel.assertExchange(config.fullyQualifiedName, config.type, config.options, (err) => {
    if (err) return next(err);
    next();
  });
}
