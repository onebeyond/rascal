const debug = require('debug')('rascal:tasks:deleteExchanges');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachOfLimit(
    _.keys(config.exchanges),
    config.concurrency,
    (name, index, cb) => {
      const channel = ctx.channels[index % config.concurrency];
      deleteExchange(channel, config.exchanges[name], cb);
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
