var debug = require('debug')('rascal:Publication')
var format = require('util').format
var _ = require('lodash').mixin({ 'defaultsDeep': require('merge-defaults') })
var uuid = require('uuid').v4
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

    this.publish = function(payload, overrides, next) {
        var publishConfig = _.defaultsDeep(overrides, config)
        var content = getContent(payload, publishConfig)
        publishConfig.options.contentType = publishConfig.options.contentType || content.type
        publishConfig.options.messageId = publishConfig.options.messageId || uuid()

        _publish(content.buffer, publishConfig, next)
    }

    this.forward = function(message, overrides, next) {
        var originalQueue = message.properties.headers.rascal.originalQueue
        var publishConfig = _.defaultsDeep(overrides, config, { routingKey: message.fields.routingKey })

        publishConfig.options = _.defaultsDeep(publishConfig.options, message.properties)

        _.set(publishConfig, 'options.headers.rascal.originalExchange', message.fields.exchange)
        _.set(publishConfig, 'options.headers.rascal.originalRoutingKey', message.fields.routingKey)
        _.set(publishConfig, 'options.CC', _.chain([]).concat(publishConfig.options.CC, format('%s.%s', originalQueue, publishConfig.routingKey)).unique().compact().value())

        _publish(message.content, publishConfig, next)
    }

    function _publish(buffer, publishConfig, next) {
        var emitter = new EventEmitter()
        getChannelFn(vhost, emitter, config, function(err, channel) {
            if (err) return emitter.emit('error', err)
            channel.on('return', emitter.emit.bind(emitter, 'return'))
            publishFn(channel, buffer, publishConfig, function(err) {
                if (err) return emitter.emit('error', err)  // Channel will already be closed, reclosing will trigger an error
                channel.close()
                emitter.emit('success', publishConfig.options.messageId)
            })
        })

        next(null, emitter)
    }

    function getContent(payload, config) {
        if (Buffer.isBuffer(payload)) return bufferMessage(payload)
        if (_.isString(payload)) return textMessage(payload)
        return jsonMessage(payload)
    }

    function bufferMessage(payload) {
        return { buffer: payload, type: undefined }
    }

    function textMessage(payload) {
        return { buffer: new Buffer(payload), type : 'text/plain' }
    }

    function jsonMessage(payload) {
        return { buffer: new Buffer(JSON.stringify(payload)), type: 'application/json' }
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
    debug(format('Publishing %d bytes to exchange: %s with routingKeys: %s', content.length, config.exchange, _.compact([].concat(config.routingKey, config.options.CC, config.options.BCC)).join(', ')))
    channel.publish(config.destination, config.routingKey, content, config.options)
    next()
}

function publishToConfirmExchange(channel, content, config, next) {
    debug(format('Publishing %d bytes to exchange: %s with routingKeys: %s', content.length, config.exchange, _.compact([].concat(config.routingKey, config.options.CC, config.options.BCC)).join(', ')))
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
