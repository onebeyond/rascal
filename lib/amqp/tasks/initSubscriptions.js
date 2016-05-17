'use strict'

var debug = require('debug')('rascal:tasks:initSubscriptions')
var format = require('util').format
var _ = require('lodash')
var async = require('async')
var Subscription = require('../Subscription')

module.exports = _.curry(function(config, ctx, next) {
    ctx.subscriptions = {}
    async.eachSeries(_.values(config.subscriptions), function(subscriptionConfig, callback) {
        initSubscription(subscriptionConfig, ctx, function(err, subscription) {
            ctx.subscriptions[subscriptionConfig.name] = subscription
            callback(err)
        })
    }, function(err) {
        next(err, config, ctx)
    })
})

function initSubscription(config, ctx, next) {
    var cache = ctx.caches[config.redeliveries.cache.type]
    if (!cache) return next(new Error(format('Unknown cache type: %s', config.redeliveries.cache.type)))
    Subscription.create(ctx.broker, ctx.vhosts[config.vhost], cache(config.redeliveries.cache), config, next)
}