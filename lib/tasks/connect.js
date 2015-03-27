'use strict'

var debug = require('debug')('amqp-nice:tasks:connect')
var format = require('util').format
var _ = require('lodash')
var amqplib = require('amqplib/callback_api')

module.exports = _.curry(function(config, ctx, next) {

    ctx.loggableUrl = config.connection.url.replace(/:[^:]*?@/, ':***@');

    debug(format('Connecting to broker using url: %s', ctx.loggableUrl))

    amqplib.connect(config.connection.url, function(err, connection) {
        if (err) return next(err, config, ctx)

        debug(format('Connected to broker using url: %s', ctx.loggableUrl))
        ctx.connection = connection
        next(null, config, ctx)
    })
})