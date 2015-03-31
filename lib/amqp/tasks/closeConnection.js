'use strict'

var debug = require('debug')('amqp-nice:tasks:checkQueues')
var format = require('util').format
var _ = require('lodash')
var async = require('async')

module.exports = _.curry(function(config, ctx, next) {
    debug(format('Closing connection: %s', config.connection.loggableUrl))
    if (!ctx.connection) return next(null, config, ctx)
    ctx.connection.close(function(err) {
        next(err, config, ctx)
    })
})
