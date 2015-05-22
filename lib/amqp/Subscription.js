var debug = require('debug')('rascal:Subscription')
var _ = require('lodash').mixin({ 'defaultsDeep': require('merge-defaults') })
var async = require('async')
var safeParse = require("safe-json-parse/callback")
var SubscriberSession = require('./SubscriberSession')
var SubscriberError = require('./SubscriberError')


module.exports = {
    create: function(broker, vhost, config, next) {
        return new Subscription(broker, vhost, config).init(next)
    }
}

function Subscription(broker, vhost, config) {

    var subscriberError = new SubscriberError(broker, vhost)
    var self = this

    this.init = function(next) {
        debug('Initialising subscription: %s', config.name)
        return next(null, self)
    }

    this.subscribe = function(overrides, next) {
        _subscribe(new SubscriberSession(), _.defaultsDeep(overrides, config), next)
    }

    function _subscribe(session, config, next) {
        debug('Subscribing to queue: %s', config.queue)
        vhost.getChannel(function(err, channel) {
            if (err) return next(err)
            if (config.prefetch) channel.prefetch(config.prefetch)

            channel.once('error', handleChannelError.bind(null, session, config))
            channel.connection.once('error', handleChannelError.bind(null, session, config))

            channel.consume(config.source, function(message) {
                if (!message) return // consume is called with a null message when the RabbitMQ cancels the subscription
                debug('Received message: %s from queue: %s', message.properties.messageId, config.queue)
                getContent(message, config, function(err, content) {
                    err ? handleContentError(session, decorate(message), err)
                        : session.emit('message', decorate(message), content, ackOrNack.bind(null, session, message))
                })
            }, config.options, function(err, response) {
                if (err) return next(err)
                session.open(channel, response.consumerTag)
                next(null, session)
            })
        })
    }

    function getContent(message, config, next) {
        var contentType = config.contentType || message.properties.contentType
        if (!contentType) return next(null, message.content)
        if (contentType === 'text/plain') return next(null, message.content.toString())
        if (contentType === 'application/json') return safeParse(new String(message.content), next)
    }

    function handleContentError(session, message, err) {
        if (session.emit('invalid_message', err, message, ackOrNack.bind(null, session, message))) return
        ackOrNack(session, message, err, function() {
            // Using setTimeout rather than process.nextTick as the latter fires before any IO.
            // If the app shuts down before the IO has completed, the message will be rolled back
            setTimeout(session.emit.bind(session, 'error', err))
        })
    }

    function decorate(message) {
        message.properties.headers = message.properties.headers || {}
        message.properties.headers.rascal = message.properties.headers.rascal || {}
        message.properties.headers.rascal.originalQueue = config.source
        if (message.properties.headers.rascal.originalRoutingKey) message.fields.routingKey = message.properties.headers.rascal.originalRoutingKey
        if (message.properties.headers.rascal.originalExchange) message.fields.exchange = message.properties.headers.rascal.originalExchange
        return message
    }

    function ackOrNack(session, message, err, recovery, next) {
        if (arguments.length === 2) return ackOrNack(session, message, undefined, undefined, _.noop)
        if (arguments.length === 3 && _.isFunction(arguments[2])) return ackOrNack(session, message, undefined, undefined, arguments[2])
        if (arguments.length === 3) return ackOrNack(session, message, err, undefined, _.noop)
        if (arguments.length === 4 && _.isFunction(arguments[3])) return ackOrNack(session, message, err, undefined, arguments[3])
        if (arguments.length === 4) return ackOrNack(session, message, err, recovery, _.noop)
        if (err) return subscriberError.handle(session, message, err, recovery || { strategy: 'fallback' }, next)
        session._ack(message)
        next()
    }

    function handleChannelError(session, config, err) {
        debug('Handling channel error: %s from %s', err.message, config.name)
        session.emit('error', err)
        config.retry && _subscribe(session, config, function(err) {
            if (err) return setTimeout(handleChannelError.bind(null, session, config, err), config.retry.delay)
        })
    }
}

