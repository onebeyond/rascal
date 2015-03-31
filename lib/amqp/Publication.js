var debug = require('debug')('amqp-nice:Broker')

var format = require('util').format
var _ = require('lodash')
var async = require('async')

_.mixin({ 'defaultsDeep': require('merge-defaults') });


module.exports = {
    create: function(vhost, config, next) {
        if (config.exchange && config.confirm) return new Publication(publishToConfirmExchange, vhost, config).init(next)
        if (config.exchange) return new Publication(publishToExchange, vhost, config).init(next)
        if (config.queue && config.confirm) return new Publication(sendToConfirmQueue, vhost, config).init(next)
        if (config.queue) return new Publication(sendToQueue, vhost, config).init(next)
    }
}

function Publication(publishFn, vhost, config) {

    var self = this

    this.init = function(next) {
        return next(null, self)
    }

    this.publish = function(message, overrides, next) {
        var publishConfig = _.defaultsDeep(overrides, config)
        var content = getContent(message)
        publishFn(vhost, content, config, next)
    }

    function getContent(message) {
        return Buffer.isBuffer(message) ? message
                                        : _.isString(message) ? new Buffer(message)
                                                              : new Buffer(JSON.stringify(message))
    }
}

function publishToExchange(vhost, content, config, next) {
    debug(format('Publishing %d bytes to exchange: %s with routingKey: %s', content.length, config.exchange, config.routingKey))
    vhost.getChannel(function(err, channel) {
        if (err) return next(err)
        channel.publish(config.destination, config.routingKey, content, config.options)
        channel.close()
        next()
    })
}

function publishToConfirmExchange(vhost, content, config, next) {
    debug(format('Publishing %d bytes to exchange: %s with routingKey: %s', content.length, config.exchange, config.routingKey))
    vhost.getConfirmChannel(function(err, channel) {
        if (err) return next(err)
        channel.publish(config.destination, config.routingKey, content, config.options, function(err, ok) {
            if (!err) channel.close() // Channel will already be closed, reclosing will trigger an error
            next(err, ok)
        })
    })
}

function sendToQueue(vhost, content, config, next) {
    debug(format('Publishing %d bytes to queue: %s', content.length, config.queue))
    vhost.getChannel(function(err, channel) {
        if (err) return next(err)
        channel.sendToQueue(config.destination, content, config.options)
        channel.close()
        next()
    })
}

function sendToConfirmQueue(vhost, content, config, next) {
    debug(format('Publishing %d bytes to queue: %s', content.length, config.queue))
    vhost.getConfirmChannel(function(err, channel) {
        if (err) return next(err)
        channel.sendToQueue(config.destination, content, config.options, function(err, ok) {
            if (!err) channel.close() // Channel will already be closed
            next(err, ok)
        })
    })
}

