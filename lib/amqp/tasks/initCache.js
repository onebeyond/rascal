var inMemory = require('../caches/inMemory')

module.exports = function(config, ctx, next) {

    inMemory.init({ size: 1000 }, function(err, cache) {
        if (err) return next(err)
        ctx.cache = cache
        return next(null, config, ctx);
    })
}