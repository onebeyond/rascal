'use strict'

var debug = require('debug')('rascal:tasks:checkQueues')
var _ = require('lodash')
var async = require('async')

module.exports = _.curry(function(config, ctx, next) {
    async.eachSeries(_.keys(config.queues), function(name, callback) {
        checkQueue(ctx.channel, config.queues[name], callback)
    }, function(err) {
        next(err, config, ctx)
    })
})

function checkQueue(channel, config, next) {
    if (!config.check) return next()
    debug('Checking queue: %s', config.fullyQualifiedName)
    channel.checkQueue(config.fullyQualifiedName, next)
}
