var debug = require('debug')('rascal:management:client');
var format = require('util').format;
var _ = require('lodash');
var agent = require('superagent');

function assertVhost(name, config, next) {
  debug('Asserting vhost: %s', name);
  var options = getVhostOptions(name, config);
  request('put', options.url, options.timeout, function(err) {
    if (!err) return next();
    var message = err.status
      ? format('Failed to assert vhost: %s. %s returned status %d', name, config.loggableUrl, err.status)
      : format('Failed to assert vhost: %s. %s errored with: %s', name, config.loggableUrl, err.message);
    return next(new Error(message));
  });
}

function checkVhost(name, config, next) {
  debug('Checking vhost: %s', name);
  var options = getVhostOptions(name, config);
  request('get', options.url, options.timeout, function(err) {
    if (!err) return next();
    var message = err.status
      ? format('Failed to check vhost: %s. %s returned status %d', name, config.loggableUrl, err.status)
      : format('Failed to check vhost: %s. %s errored with: %s', name, config.loggableUrl, err.message);
    return next(new Error(message));
  });
}

function deleteVhost(name, config, next) {
  debug('Deleting vhost: %s', name);
  var options = getVhostOptions(name, config);
  request('delete', options.url, options.timeout, function(err) {
    if (!err) return next();
    var message = err.status
      ? format('Failed to delete vhost: %s. %s returned status %d', name, config.loggableUrl, err.status)
      : format('Failed to delete vhost: %s. %s errored with: %s', name, config.loggableUrl, err.message);
    return next(new Error(message));
  });
}

function getVhostOptions(name, config) {
  var url = format('%s/%s/%s', config.url, 'api/vhosts', name);
  return _.defaultsDeep({ url: url }, config.options);
}

function request(method, url, timeout, next) {
  agent[method](url)
    .timeout({ deadline: timeout })
    .then(function() {
      next();
    })
    .catch(next);
}

module.exports = {
  assertVhost: assertVhost,
  checkVhost: checkVhost,
  deleteVhost: deleteVhost,
};
