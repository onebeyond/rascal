const http = require('http');
const debug = require('debug')('rascal:management:client');
const format = require('util').format;

function Client(agent) {
  const self = this;

  this.assertVhost = function (name, config, next) {
    debug('Asserting vhost: %s', name);
    const url = getUrl(name, config);
    self._request('PUT', url, config.options, (err) => {
      if (!err) return next();
      const _err = err.status ? new Error(format('Failed to assert vhost: %s. %s returned status %d', name, config.loggableUrl, err.status)) : err;
      return next(_err);
    });
  };

  this.checkVhost = function (name, config, next) {
    debug('Checking vhost: %s', name);
    const url = getUrl(name, config);
    self._request('GET', url, config.options, (err) => {
      if (!err) return next();
      const _err = err.status ? new Error(format('Failed to check vhost: %s. %s returned status %d', name, config.loggableUrl, err.status)) : err;
      return next(_err);
    });
  };

  this.deleteVhost = function (name, config, next) {
    debug('Deleting vhost: %s', name);
    const url = getUrl(name, config);
    self._request('DELETE', url, config.options, (err) => {
      if (!err) return next();
      const _err = err.status ? new Error(format('Failed to delete vhost: %s. %s returned status %d', name, config.loggableUrl, err.status)) : err;
      return next(_err);
    });
  };

  this._request = function (method, url, options, next) {
    const req = http.request(url, { ...options, method, agent }, (res) => {
      if (res.statusCode >= 300) {
        const err = Object.assign(new Error('HTTP Error'), { status: res.statusCode });
        return next(err);
      }
      res.on('data', () => {});
      res.on('end', () => next());
    });
    req.on('error', next);
    req.end();
  };

  function getUrl(name, config) {
    return format('%s/%s/%s', config.url, 'api/vhosts', name);
  }
}

module.exports = Client;
