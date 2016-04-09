var debug = require('debug')('rascal:Subscription')
var _ = require('lodash').mixin({ 'defaultsDeep': require('merge-defaults') })
var safeParse = require('safe-json-parse/callback')
var SubscriberSession = require('./SubscriberSession')
var SubscriberError = require('./SubscriberError')
var format = require('util').format
var LRU = require('lru-cache')


module.exports = {
    create: function(broker, vhost, config, next) {
        return new Subscription(broker, vhost, config).init(next)
    }
}

function Subscription(broker, vhost, config) {

    var cache = LRU({ max: config.redeliveries.cache.size })
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

                message = decorate(message)
                if (immediateNack(message)) return ackOrNack(session, message, true)
                if (redeliveriesExceeded(message)) return handleRedeliveriesExceeded(session, message)

                getContent(message, config, function(err, content) {
                    err ? handleContentError(session, message, err)
                        : session.emit('message', message, content, ackOrNack.bind(null, session, message))
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
        if (contentType === 'application/json') return safeParse(message.content.toString(), next)
    }

    function handleContentError(session, message, err) {
        if (session.emit('invalid_message', err, message, ackOrNack.bind(null, session, message))) return
        nackAndError(session, message, err)
    }

    function redeliveriesExceeded(message) {
        return message.properties.headers.rascal.redeliveries > config.redeliveries.limit
    }

    function handleRedeliveriesExceeded(session, message) {
        var err = new Error(format('Message %s has exceeded %d redeliveries', message.properties.messageId, config.redeliveries.limit))
        if (session.emit('redeliveries_exceeded', err, message, ackOrNack.bind(null, session, message))) return
        nackAndError(session, message, err)
    }

    function nackAndError(session, message, err) {
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
        message.properties.headers.rascal.redeliveries = 0
        if (message.fields.redelivered && message.properties.messageId) incrementRedeliveries(message)
        if (message.properties.headers.rascal.originalRoutingKey) message.fields.routingKey = message.properties.headers.rascal.originalRoutingKey
        if (message.properties.headers.rascal.originalExchange) message.fields.exchange = message.properties.headers.rascal.originalExchange
        return message
    }

    function incrementRedeliveries(message) {
        var redeliveries = cache.get(message.properties.messageId) + 1 || 1
        cache.set(message.properties.messageId, redeliveries)
        message.properties.headers.rascal.redeliveries = redeliveries
    }

    function immediateNack(message) {
        if (_.get(message, format('properties.headers.rascal.recovery.%s.immediateNack', message.properties.headers.rascal.originalQueue))) return true
        if (_.get(message, format('properties.headers.rascal.recovery.%s.immediateNack', message.properties.headers.rascal.originalQueue))) return true
        return false
    }

    function ackOrNack(session, message, err, recovery, next) {
        if (arguments.length === 2) return ackOrNack(session, message, undefined, undefined, _.noop)
        if (arguments.length === 3 && _.isFunction(arguments[2])) return ackOrNack(session, message, undefined, undefined, arguments[2])
        if (arguments.length === 3) return ackOrNack(session, message, err, undefined, _.noop)
        if (arguments.length === 4 && _.isFunction(arguments[3])) return ackOrNack(session, message, err, undefined, arguments[3])
        if (arguments.length === 4) return ackOrNack(session, message, err, recovery, _.noop)
        if (err) return subscriberError.handle(session, message, err, recovery || { strategy: 'nack' }, next)
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

