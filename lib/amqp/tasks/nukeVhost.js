'use strict'

module.exports = function(config, ctx, next) {
    ctx.vhost.nuke(function(err) {
        if (err) return next(err)
        return next(null, config, ctx)
    })
}