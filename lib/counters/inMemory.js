var _ = require('lodash');
var lruCache = require('lru-cache');

module.exports = function init(options) {
  var size = _.get(options, 'size') || 1000;
  var cache = lruCache({ max: size });

  return {
    incrementAndGet: function(key, next) {
      var redeliveries = cache.get(key) + 1 || 1;
      cache.set(key, redeliveries);
      next(null, redeliveries);
    },
  };
};