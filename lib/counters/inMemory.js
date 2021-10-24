const _ = require('lodash');
const LRUCache = require('lru-cache');

module.exports = function init(options) {
  const size = _.get(options, 'size') || 1000;
  const cache = new LRUCache({ max: size });

  return {
    incrementAndGet(key, next) {
      const redeliveries = cache.get(key) + 1 || 1;
      cache.set(key, redeliveries);
      next(null, redeliveries);
    },
  };
};
