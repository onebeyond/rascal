const debug = require('debug')('rascal:tasks:deleteExchanges');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachSeries(
    _.keys(config.exchanges),
    (name, callback) => {
      deleteExchange(ctx.channel, config.exchanges[name], callback);
    },
    (err) => {
      next(err, config, ctx);
    }
  );
});

function deleteExchange(channel, config, next) {
  if (config.fullyQualifiedName === '') return next();
  debug('Deleting exchange: %s', config.fullyQualifiedName);
  channel.deleteExchange(config.fullyQualifiedName, {}, next);
}
