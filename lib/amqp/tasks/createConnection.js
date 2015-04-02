'use strict'

var debug = require('debug')('amqp-nice:tasks:createConnection')
var format = require('util').format
var _ = require('lodash')
var amqplib = require('amqplib/callback_api')

module.exports = _.curry(function(config, ctx, next) {

    debug(format('Connecting to broker using url: %s', config.connection.loggableUrl))

    amqplib.connect(config.connection.url, function(err, connection) {
        if (err) return next(err, config, ctx)

        ctx.connection = connection

        /*
         * If an error occurs during initialisation (e.g. if checkExchanges fails),
         * and no error handler has been bound to the connection, then the error will bubble up
         * to the UncaughtException handler, potentially crashing the node process.
         *
         * By adding an error handler now, we ensure that instead of being emitted as events
         * errors will be passed via the callback chain, so they can still be handled by the caller
         *
         * This error handle is removed in the vhost after the initialiation has complete
         */
        connection.on('error', function(err) {
            debug(format('Received error: %s', err.message))
        })

        next(null, config, ctx)
    })
})