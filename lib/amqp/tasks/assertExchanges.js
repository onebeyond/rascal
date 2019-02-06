var debug = require('debug')('rascal:tasks:assertExchanges');
var _ = require('lodash');
var async = require('async');

module.exports = _.curry(function(config, ctx, next) {
  async.eachSeries(_.keys(config.exchanges), function(name, callback) {
    assertExchange(ctx.channel, config.exchanges[name], callback);
  }, function(err) {
    next(err, config, ctx);
  });
});

function assertExchange(channel, config, next) {
  if (!config.assert) return next();
  if (config.fullyQualifiedName === '') return next();
  debug('Asserting exchange: %s', config.fullyQualifiedName);
  channel.assertExchange(config.fullyQualifiedName, config.type, config.options, next);
}
