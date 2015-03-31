'use strict'

var debug = require('debug')('amqp-nice:tasks:closeChannel')
var format = require('util').format
var _ = require('lodash')

module.exports = _.curry(function(config, ctx, next) {

    debug('Closing channel')

    ctx.channel.close(function(err) {
        if (err) return next(err, config, ctx)
        delete ctx.channel
        next(null, config, ctx)
    })
})