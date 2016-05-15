var lruCache = require('lru-cache')

module.exports = function(options) {
    var cache = lruCache({ max: options.size })

    return {
        incrementAndGet: function(key, next) {
            var redeliveries = cache.get(key) + 1 || 1
            cache.set(key, redeliveries)
            next(null, redeliveries)
        }
    }
}