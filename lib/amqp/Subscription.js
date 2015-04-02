var debug = require('debug')('amqp-nice:Subscription')

var format = require('util').format
var _ = require('lodash')
var async = require('async')
var safeParse = require("safe-json-parse/callback")

_.mixin({ 'defaultsDeep': require('merge-defaults') });


module.exports = {
    create: function(vhost, config, next) {
        return new Subscription(vhost, config).init(next)
    }
}

function Subscription(vhost, config) {

    var self = this

    this.init = function(next) {
        debug(format('Initialising subscription: %s', config.name))
        return next(null, self)
    }

    this.subscribe = function(handler, overrides, next) {
        _subscribe(handler, _.defaultsDeep(overrides, config), next)
    }

    function _subscribe(handler, config, next) {
        debug(format('Subscribing to queue: %s', config.queue))
        vhost.getChannel(function(err, channel) {
            if (err) return next(err)
            if (config.retry) {
                channel.once('error', handleChannelError.bind(null, handler, config))
                channel.connection.once('error', handleChannelError.bind(null, handler, config))
            }

            channel.consume(config.source, function(message) {
                if (!message) return // consume is being called with no arguments. No idea why
                debug('Received message: %s from queue: %s', message.properties.messageId, config.queue)
                getContent(message, function(err, content) {
                    setImmediate(function() {
                        handler(err, message, content, ackOrNack.bind(null, channel, message))
                    })
                })
            }, config.options, next)
        })
    }

    function getContent(message, next) {
        if (!message.properties.contentType) return next(null, message.content)
        if (message.properties.contentType === 'text/plain') return next(null, message.content.toString())
        if (message.properties.contentType === 'application/json') return safeParse(new String(message.content), next)
    }

    function ackOrNack(channel, message, err, options) {
        if (arguments.length === 3) return ackOrNack(channel, message, err, {})
        if (err) return nack(channel, message, options)
        ack(channel, message)
    }

    function ack(channel, message) {
        debug('Acknowledging message: %s', message.properties.messageId)
        channel.ack(message)
    }

    function nack(channel, message, options) {
        debug('Not acknowledging message: %s with options:', message.properties.messageId, options)
        if (options.requeue && options.defer) return setTimeout(nack.bind(null, channel, message, { requeue: true }), options.defer).unref()
        channel.nack(message, false, !!options.requeue)
    }

    this.unsubscribe = function(consumerTag, next) {
        debug(format('Unsubscribing from queue: %s', config.queue))
        vhost.getChannel(function(err, channel) {
            if (err) return next(err)
            channel.cancel(consumerTag, function(err) {
                if (err) return next(err)
                channel.close(next)
            })
        })
    }

    function handleChannelError(handler, config, err) {
        debug(format('Handling channel error: %s from %s', err.message, config.name))
        _subscribe(handler, config, function(err) {
            if (err) return setTimeout(handleChannelError.bind(null, handler, overrides, err), config.retry.delay)
        })
    }
}


