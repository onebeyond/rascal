'use strict'

var debug = require('debug')('amqp-nice:tasks:deleteExchanges')
var format = require('util').format
var _ = require('lodash')
var async = require('async')

module.exports = _.curry(function(config, ctx, next) {
    async.eachSeries(_.keys(config.exchanges), function(name, callback) {
        deleteExchange(ctx.channel, config.exchanges[name], callback)
    }, function(err) {
        next(err, config, ctx)
    })
})

function deleteExchange(channel, config, next) {
    debug(format('Deleting exchange: %s', config.fullyQualifiedName))
    channel.deleteExchange(config.fullyQualifiedName, {}, next)
}