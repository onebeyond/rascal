'use strict'

var debug = require('debug')('rascal:tasks:assertQueues')
var _ = require('lodash')
var async = require('async')

module.exports = _.curry(function(config, ctx, next) {
    async.eachSeries(_.keys(config.queues), function(name, callback) {
        assertQueue(ctx.channel, config.queues[name], callback)
    }, function(err) {
        next(err, config, ctx)
    })
})

function assertQueue(channel, config, next) {
    if (!config.assert) return next()
    debug('Asserting queue: %s', config.fullyQualifiedName)
    channel.assertQueue(config.fullyQualifiedName, config.options, next)
}
