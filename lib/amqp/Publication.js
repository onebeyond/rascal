var debug = require('debug')('rascal:Publication')
var format = require('util').format
var _ = require('lodash').mixin({ 'defaultsDeep': require('merge-defaults') })
var async = require('async')
var uuid = require('node-uuid').v4
var EventEmitter = require('events').EventEmitter

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
    var emitter = new EventEmitter()

    this.init = function(next) {
        debug(format('Initialising publication: %s', config.name))
        return next(null, self)
    }

    this.publish = function(message, overrides, next) {
        var publishConfig = _.defaultsDeep(overrides, config)
        var content = getContent(message, publishConfig)
        publishConfig.options.contentType = content.type
        publishConfig.options.messageId = publishConfig.options.messageId || uuid()
        publishFn(vhost, content.buffer, publishConfig, next)
        return emitter
    }

    function getContent(message, config) {
        if (Buffer.isBuffer(message)) return bufferMessage(message)
        if (_.isString(message)) return textMessage(message)
        return jsonMessage(message)
    }

    function bufferMessage(message) {
        return { buffer: message, type: undefined }
    }

    function textMessage(message) {
        return { buffer: new Buffer(message), type : 'text/plain' }
    }

    function jsonMessage(message) {
        return { buffer: new Buffer(JSON.stringify(message)), type: 'application/json' }
    }
}

function publishToExchange(vhost, content, config, next) {
    debug(format('Publishing %d bytes to exchange: %s with routingKey: %s', content.length, config.exchange, config.routingKey))
    vhost.getChannel(function(err, channel) {
        if (err) return next(err)
        channel.once('error', handleChannelError.bind(null, config))
        channel.publish(config.destination, config.routingKey, content, config.options)
        channel.close()
        setImmediate(function() {
            next(null, config.options.messageId)
        })
    })
}

function publishToConfirmExchange(vhost, content, config, next) {
    debug(format('Publishing %d bytes to exchange: %s with routingKey: %s', content.length, config.exchange, config.routingKey))
    vhost.getConfirmChannel(function(err, channel) {
        if (err) return next(err)
        channel.once('error', handleChannelError.bind(null, config))
        channel.publish(config.destination, config.routingKey, content, config.options, function(err, ok) {
            if (!err) channel.close() // Channel will already be closed, reclosing will trigger an error
            setImmediate(function() {
                next(err, config.options.messageId)
            })
        })
    })
}

function sendToQueue(vhost, content, config, next) {
    debug(format('Publishing %d bytes to queue: %s', content.length, config.queue))
    vhost.getChannel(function(err, channel) {
        if (err) return next(err)
        channel.once('error', handleChannelError.bind(null, config))
        channel.sendToQueue(config.destination, content, config.options)
        channel.close()
        setImmediate(function() {
            next(null, config.options.messageId)
        })
    })
}

function sendToConfirmQueue(vhost, content, config, next) {
    debug(format('Publishing %d bytes to queue: %s', content.length, config.queue))
    vhost.getConfirmChannel(function(err, channel) {
        if (err) return next(err)
        channel.once('error', handleChannelError.bind(null, config))
        channel.sendToQueue(config.destination, content, config.options, function(err, ok) {
            if (!err) channel.close() // Channel will already be closed
            setImmediate(function() {
                next(err, config.options.messageId)
            })
        })
    })
}

function handleChannelError(config, err) {
    debug(format('Channel error: %s during publication to %s', err.message, config.name))
    emitter.emit(err)
}
