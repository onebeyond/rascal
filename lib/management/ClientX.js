const debug = require('debug')('rascal:management:client');
const format = require('util').format;
const _ = require('lodash');
const defaultAgent = require('superagent');

function Client(suppliedAgent) {
  const agent = suppliedAgent || defaultAgent;
  const self = this;

  this.assertVhost = function (name, config, next) {
    debug('Asserting vhost: %s', name);
    const options = getVhostOptions(name, config);
    self._request('put', options.url, options.timeout, (err) => {
      if (!err) return next();
      const message = err.status ? format('Failed to assert vhost: %s. %s returned status %d', name, config.loggableUrl, err.status) : format('Failed to assert vhost: %s. %s errored with: %s', name, config.loggableUrl, err.message);
      return next(new Error(message));
    });
  };

  this.checkVhost = function (name, config, next) {
    debug('Checking vhost: %s', name);
    const options = getVhostOptions(name, config);
    self._request('get', options.url, options.timeout, (err) => {
      if (!err) return next();
      const message = err.status ? format('Failed to check vhost: %s. %s returned status %d', name, config.loggableUrl, err.status) : format('Failed to check vhost: %s. %s errored with: %s', name, config.loggableUrl, err.message);
      return next(new Error(message));
    });
  };

  this.deleteVhost = function (name, config, next) {
    debug('Deleting vhost: %s', name);
    const options = getVhostOptions(name, config);
    self._request('delete', options.url, options.timeout, (err) => {
      if (!err) return next();
      const message = err.status ? format('Failed to delete vhost: %s. %s returned status %d', name, config.loggableUrl, err.status) : format('Failed to delete vhost: %s. %s errored with: %s', name, config.loggableUrl, err.message);
      return next(new Error(message));
    });
  };

  this._request = function (method, url, timeout, next) {
    agent[method](url)
      .timeout({ deadline: timeout })
      .then(() => {
        next();
      })
      .catch(next);
  };

  function getVhostOptions(name, config) {
    const url = format('%s/%s/%s', config.url, 'api/vhosts', name);
    return _.defaultsDeep({ url }, config.options);
  }
}

module.exports = Client;
