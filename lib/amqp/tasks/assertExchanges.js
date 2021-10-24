const debug = require('debug')('rascal:tasks:assertExchanges');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachSeries(
    _.keys(config.exchanges),
    (name, callback) => {
      assertExchange(ctx.channel, config.exchanges[name], callback);
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
  channel.assertExchange(config.fullyQualifiedName, config.type, config.options, next);
}
