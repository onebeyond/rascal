var debug = require('debug')('rascal:tasks:assertVhost');
var format = require('util').format;
var _ = require('lodash');
var async = require('async');
var request = require('request');

module.exports = _.curry(function(config, ctx, next) {
  if (!config.assert) return next(null, config, ctx);
  ctx.connectionIndex = _.get(ctx, 'connectionIndex', 0);
  var candidates = config.connections;

  async.retry(candidates.length, function(cb) {
    var connectionConfig = candidates[ctx.connectionIndex];
    assertVhost(config.name, connectionConfig, function(err) {
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

function assertVhost(name, connectionConfig, next) {
  debug('Asserting vhost: %s', name);
  var url = format('%s/%s/%s', connectionConfig.management.url, 'api/vhosts', name);
  var options = _.defaultsDeep({ method: 'PUT', url: url }, connectionConfig.management.options);
  request(options, function(err, res, body) {
    if (err) return next(err);
    if (res.statusCode > 400) return next(new Error(format('Failed to assert vhost: %s. %s returned status %d', name, connectionConfig.management.loggableUrl, res.statusCode)));
    return next();
  });
}
