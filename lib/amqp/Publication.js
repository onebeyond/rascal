var debug = require('debug')('rascal:Publication')
var format = require('util').format
var _ = require('lodash').mixin({ 'defaultsDeep': require('merge-defaults') })
var uuid = require('uuid').v4
var EventEmitter = require('events').EventEmitter

module.exports = {
    create: function(vhost, config, next) {
        if (config.exchange && config.confirm) return new Publication(borrowConfirmChannel, returnConfirmChannel, publishToConfirmExchange, vhost, config).init(next)
        if (config.exchange) return new Publication(borrowChannel, returnChannel, publishToExchange, vhost, config).init(next)
        if (config.queue && config.confirm) return new Publication(borrowConfirmChannel, returnConfirmChannel, sendToConfirmQueue, vhost, config).init(next)
        if (config.queue) return new Publication(borrowChannel, returnChannel, sendToQueue, vhost, config).init(next)
    }
}

function Publication(borrowChannelFn, returnChannelFn, publishFn, vhost, config) {

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
        _.set(publishConfig, 'options.CC', _.chain([]).concat(publishConfig.options.CC, format('%s.%s', originalQueue, publishConfig.routingKey)).uniq().compact().value())

        _publish(message.content, publishConfig, next)
    }

    function _publish(buffer, publishConfig, next) {
        var emitter = new EventEmitter()
        var errorHandler = handleChannelError.bind(null, emitter, config)
        var returnHandler = emitter.emit.bind(emitter, 'return')
        borrowChannelFn(vhost, errorHandler, returnHandler, function(err, channel) {
            if (err) return emitter.emit('error', err)
            publishFn(channel, buffer, publishConfig, function(err) {
              returnChannelFn(vhost, channel, errorHandler, returnHandler)
              if (err) return emitter.emit('error', err)
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

function borrowConfirmChannel(vhost, errorHandler, returnHandler, next) {
    vhost.borrowConfirmChannel(function(err, channel) {
        if (err) return next(err)
        channel.once('error', errorHandler)
        channel.on('return', returnHandler)
        next(null, channel)
    })
}

function borrowChannel(vhost, errorHandler, returnHandler, next) {
    vhost.borrowChannel(function(err, channel) {
        if (err) return next(err)
        channel.once('error', errorHandler)
        channel.on('return', returnHandler)
        next(null, channel)
    })
}

function returnConfirmChannel(vhost, channel, errorHandler, returnHandler) {
    vhost.returnConfirmChannel(channel)
    channel.removeListener('error', errorHandler)
    channel.removeListener('return', returnHandler)
}

function returnChannel(vhost, channel, errorHandler, returnHandler) {
    vhost.returnChannel(channel)
    channel.removeListener('error', errorHandler)
    channel.removeListener('return', returnHandler)
}

function publishToExchange(channel, content, config, next) {
    debug(format('Publishing %d bytes to exchange: %s with routingKeys: %s', content.length, config.exchange, _.compact([].concat(config.routingKey, config.options.CC, config.options.BCC)).join(', ')))
    channel.publish(config.destination, config.routingKey, content, config.options)
    next()
}

function publishToConfirmExchange(channel, content, config, next) {
    debug(format('Publishing %d bytes to confirm exchange: %s with routingKeys: %s', content.length, config.exchange, _.compact([].concat(config.routingKey, config.options.CC, config.options.BCC)).join(', ')))
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
