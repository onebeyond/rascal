'use strict'

var debug = require('debug')('amqp-nice:tasks:purgeQueues')
var format = require('util').format
var _ = require('lodash')
var async = require('async')

module.exports = _.curry(function(config, ctx, next) {
    async.eachSeries(_.keys(config.queues), function(name, callback) {
        purgeQueue(ctx.channel, config.queues[name], callback)
    }, function(err) {
        next(err, config, ctx)
    })
})

function purgeQueue(channel, config, next) {
    if (!config.purge) return next()
    debug(format('Purging queue: %s', config.fullyQualifiedName))
    channel.purgeQueue(config.fullyQualifiedName, next)
}