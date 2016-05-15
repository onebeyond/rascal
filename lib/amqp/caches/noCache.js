var lruCache = require('lru-cache')

module.exports = function(options) {

    return {
        incrementAndGet: function(key, next) {
            next(null, 0)
        }
    }
}