const debug = require('debug')('rascal:tasks:checkExchanges');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachSeries(
    _.keys(config.exchanges),
    (name, callback) => {
      checkExchange(ctx.channel, config.exchanges[name], callback);
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
