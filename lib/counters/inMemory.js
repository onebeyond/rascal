var _ = require('lodash');
var LRUCache = require('lru-cache');

module.exports = function init(options) {
  const size = _.get(options, 'size') || 1000;
  const cache = new LRUCache({
    max: size,
  });

  return {
    incrementAndGet: function (key, next) {
      var redeliveries = cache.get(key) + 1 || 1;
      cache.set(key, redeliveries);
      next(null, redeliveries);
    },
  };
};
