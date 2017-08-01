'use strict'

var debug = require('debug')('rascal:tasks:checkExchanges')
var _ = require('lodash')
var async = require('async')

module.exports = _.curry(function(config, ctx, next) {
    async.eachSeries(_.keys(config.exchanges), function(name, callback) {
        checkExchange(ctx.channel, config.exchanges[name], callback)
    }, function(err) {
        next(err, config, ctx)
    })
})

function checkExchange(channel, config, next) {
    if (!config.check) return next()
    debug('Checking exchange: %s', config.fullyQualifiedName)
    channel.checkExchange(config.fullyQualifiedName, next)
}
