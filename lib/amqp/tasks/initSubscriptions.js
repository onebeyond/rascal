'use strict'

var debug = require('debug')('rascal:tasks:initSubscriptions')
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
    Subscription.create(ctx.broker, ctx.vhosts[config.vhost], ctx.counters[config.redeliveries.counter], config, next)
}