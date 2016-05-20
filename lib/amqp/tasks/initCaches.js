'use strict'

var debug = require('debug')('rascal:tasks:initCaches')
var format = require('util').format
var _ = require('lodash')
var async = require('async')

module.exports = _.curry(function(config, ctx, next) {
    ctx.caches = {}
    async.eachSeries(_.values(config.redeliveries.caches), function(cacheConfig, callback) {
        initCache(cacheConfig, ctx, function(err, cache) {
            ctx.caches[cacheConfig.name] = cache
            callback(err)
        })
    }, function(err) {
        next(err, config, ctx)
    })
})

function initCache(config, ctx, next) {
    if (!ctx.components.caches[config.type]) return next(new Error(format('Unknown cache type: %s', config.type)))
    next(null, ctx.components.caches[config.type](config))
}

