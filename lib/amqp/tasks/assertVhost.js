var debug = require('debug')('rascal:tasks:assertVhost');
var _ = require('lodash');
var async = require('async');
var client = require('../../management/client');

module.exports = _.curry(function(config, ctx, next) {
  if (!config.assert) return next(null, config, ctx);
  ctx.connectionIndex = _.get(ctx, 'connectionIndex', 0);
  var candidates = config.connections;

  async.retry(candidates.length, function(cb) {
    var connectionConfig = candidates[ctx.connectionIndex];
    client.assertVhost(config.name, connectionConfig.management, function(err) {
      if (err) {
        ctx.connectionIndex = ctx.connectionIndex + 1 % candidates.length;
        return cb(err);
      }
      ctx.connectionConfig = connectionConfig;
      cb();
    });
  }, function(err) {
    next(err, config, ctx);
  });
});
