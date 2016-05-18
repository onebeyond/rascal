'use strict'

var debug = require('debug')('rascal:tasks:createChannel')
var _ = require('lodash')

module.exports = _.curry(function(config, ctx, next) {

    debug('Creating channel')

    ctx.connection.createChannel(function(err, channel) {
        if (err) return next(err, config, ctx)
        ctx.channel = channel
        next(null, config, ctx)
    })
})