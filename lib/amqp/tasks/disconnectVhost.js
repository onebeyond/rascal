'use strict'

module.exports = function(config, ctx, next) {
    ctx.vhost.disconnect(function(err) {
        if (err) return next(err)
        return next(null, config, ctx)
    })
}