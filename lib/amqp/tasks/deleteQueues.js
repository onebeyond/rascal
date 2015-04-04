'use strict'

var debug = require('debug')('rascal:tasks:deleteQueues')
var format = require('util').format
var _ = require('lodash')
var async = require('async')

module.exports = _.curry(function(config, ctx, next) {
    async.eachSeries(_.keys(config.queues), function(name, callback) {
        deleteQueue(ctx.channel, config.queues[name], callback)
    }, function(err) {
        next(err, config, ctx)
    })
})

function deleteQueue(channel, config, next) {
    debug(format('Deleting queue: %s', config.fullyQualifiedName))
    channel.deleteQueue(config.fullyQualifiedName, {}, next)
}