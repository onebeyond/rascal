var debug = require('debug')('rascal:tasks:deleteVhost');
var format = require('util').format;
var _ = require('lodash');
var async = require('async');
var request = require('superagent');

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
  const defaultUrl = format('%s/%s/%s', connectionConfig.management.url, 'api/vhosts', name);
  const { url = defaultUrl, timeout } = connectionConfig.management.options;
  request.delete(url)
    .timeout({
      deadline: timeout,
    })
    .then(() => next())
    .catch(error => {
      const errorMessage = format('Failed to delete vhost: %s. %s returned status %d', name, connectionConfig.management.loggableUrl, error.status);
      return next(new Error(errorMessage));
    });
}
