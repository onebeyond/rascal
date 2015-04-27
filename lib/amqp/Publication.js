var debug = require('debug')('rascal:Publication')
var format = require('util').format
var _ = require('lodash').mixin({ 'defaultsDeep': require('merge-defaults') })
var async = require('async')
var uuid = require('node-uuid').v4
var EventEmitter = require('events').EventEmitter

module.exports = {
    create: function(vhost, config, next) {
        if (config.exchange && config.confirm) return new Publication(getConfirmChannel, publishToConfirmExchange, vhost, config).init(next)
        if (config.exchange) return new Publication(getChannel, publishToExchange, vhost, config).init(next)
        if (config.queue && config.confirm) return new Publication(getConfirmChannel, sendToConfirmQueue, vhost, config).init(next)
        if (config.queue) return new Publication(getChannel, sendToQueue, vhost, config).init(next)
    }
}

function Publication(getChannelFn, publishFn, vhost, config) {

    var self = this

    this.init = function(next) {
        debug(format('Initialising publication: %s', config.name))
        return next(null, self)
    }

    this.publish = function(message, overrides, next) {
        var emitter = new EventEmitter()
        var publishConfig = _.defaultsDeep(overrides, config)
        var content = getContent(message, publishConfig)
        publishConfig.options.contentType = content.type
        publishConfig.options.messageId = publishConfig.options.messageId || uuid()

        getChannelFn(vhost, emitter, config, function(err, channel) {
            if (err) return emitter.emit('error', err)
            publishFn(channel, content.buffer, publishConfig, function(err) {
                if (err) return emitter.emit('error', err)  // Channel will already be closed, reclosing will trigger an error
                channel.close()
                emitter.emit('success', publishConfig.options.messageId)
            })
        })

        next(null, emitter)
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

function getConfirmChannel(vhost, emitter, config, next) {
    vhost.getConfirmChannel(function(err, channel) {
        if (err) return next(err)
        channel.once('error', handleChannelError.bind(null, emitter, config))
        next(null, channel)
    })
}

function getChannel(vhost, emitter, config, next) {
    vhost.getChannel(function(err, channel) {
        if (err) return next(err)
        channel.once('error', handleChannelError.bind(null, emitter, config))
        next(null, channel)
    })
}

function publishToExchange(channel, content, config, next) {
    debug(format('Publishing %d bytes to exchange: %s with routingKey: %s', content.length, config.exchange, config.routingKey))
    channel.publish(config.destination, config.routingKey, content, config.options)
    next()
}

function publishToConfirmExchange(channel, content, config, next) {
    debug(format('Publishing %d bytes to exchange: %s with routingKey: %s', content.length, config.exchange, config.routingKey))
    channel.publish(config.destination, config.routingKey, content, config.options, next)
}

function sendToQueue(channel, content, config, next) {
    debug(format('Publishing %d bytes to queue: %s', content.length, config.queue))
    channel.sendToQueue(config.destination, content, config.options)
    next()
}

function sendToConfirmQueue(channel, content, config, next) {
    debug(format('Publishing %d bytes to queue: %s', content.length, config.queue))
    channel.sendToQueue(config.destination, content, config.options, next)
}

function handleChannelError(emitter, config, err) {
    debug(format('Channel error: %s during publication to %s', err.message, config.name))
    emitter.emit(err)
}
