var debug = require('debug')('rascal:tasks:deleteVhost');
var format = require('util').format;
var _ = require('lodash');
var async = require('async');
var request = require('request');

module.exports = _.curry(function(config, ctx, next) {
  var vhostConfig = config.vhosts[ctx.vhost.name];
  if (!vhostConfig.assert) return next(null, config, ctx);

  var candidates = vhostConfig.connections;

  async.retry(candidates.length, function(cb) {
    var connectionConfig = candidates[ctx.vhost.connectionIndex];
    deleteVhost(vhostConfig.name, connectionConfig, function(err) {
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

function deleteVhost(name, connectionConfig, next) {
  debug('Deleting vhost: %s', name);
  var url = format('%s/%s/%s', connectionConfig.management.url, 'api/vhosts', name);
  var options = _.defaultsDeep({ method: 'DELETE', url: url }, connectionConfig.management.options);
  request(options, function(err, res, body) {
    if (err) return next(err);
    if (res.statusCode > 400) return next(new Error(format('Failed to delete vhost: %s. %s returned status %d', name, connectionConfig.management.loggableUrl, res.statusCode)));
    return next();
  });
}
