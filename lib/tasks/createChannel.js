'use strict'

var debug = require('debug')('amqp-nice:tasks:createChannel')
var format = require('util').format
var _ = require('lodash')

module.exports = _.curry(function(config, ctx, next) {

    debug('Creating channel')

    ctx.connection.createChannel(function(err, channel) {
        if (err) return next(err, config, ctx)
        channel.on('error', config.channel.onError.bind(null, config, ctx))
        channel.on('close', config.channel.onClose.bind(null, config, ctx))
        ctx.channel = channel
        next(null, config, ctx)
    })
})