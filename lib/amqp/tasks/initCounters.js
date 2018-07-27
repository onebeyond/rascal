var debug = require('debug')('rascal:tasks:initCounters')
var format = require('util').format
var _ = require('lodash')
var async = require('async')

module.exports = _.curry(function(config, ctx, next) {
    ctx.counters = {}
    async.eachSeries(_.values(config.redeliveries.counters), function(counterConfig, callback) {
        initCounter(counterConfig, ctx, function(err, counter) {
            ctx.counters[counterConfig.name] = counter
            callback(err)
        })
    }, function(err) {
        next(err, config, ctx)
    })
})

function initCounter(config, ctx, next) {
    if (!ctx.components.counters[config.type]) return next(new Error(format('Unknown counter type: %s', config.type)))
    next(null, ctx.components.counters[config.type](config))
}
