var debug = require('debug')('rascal:tasks:deleteVhost');
var _ = require('lodash');
var async = require('async');
var client = require('../../management/client');

module.exports = _.curry(function(config, ctx, next) {
  var vhostConfig = config.vhosts[ctx.vhost.name];
  if (!vhostConfig.assert) return next(null, config, ctx);

  var candidates = vhostConfig.connections;

  async.retry(candidates.length, function(cb) {
    var connectionConfig = candidates[ctx.vhost.connectionIndex];
    client.deleteVhost(vhostConfig.name, connectionConfig.management, function(err) {
      if (err) {
        ctx.vhost.connectionIndex = ctx.vhost.connectionIndex + 1 % candidates.length;
        return cb(err);
      }
      ctx.connectionConfig = connectionConfig;
      cb();
    });
  }, function(err) {
    next(err, config, ctx);
  });
});
