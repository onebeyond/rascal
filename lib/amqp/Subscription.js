var debug = require('debug')('rascal:Subscription')
var _ = require('lodash').mixin({ 'defaultsDeep': require('merge-defaults') })
var async = require('async')
var safeParse = require("safe-json-parse/callback")
var SubscriberSession = require('./SubscriberSession')


module.exports = {
    create: function(vhost, config, next) {
        return new Subscription(vhost, config).init(next)
    }
}

function Subscription(vhost, config) {

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
                if (!message) return // consume is called with a null message when the channel is torn down
                debug('Received message: %s from queue: %s', message.properties.messageId, config.queue)
                getContent(message, config, function(err, content) {
                    err ? session.emit('error', err)
                        : session.emit('message', decorate(message), content, ackOrNack.bind(null, channel, message))
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

    function decorate(message) {
        if (!message.properties.headers.rascal) return message
        if (message.properties.headers.rascal.originalRoutingKey) message.fields.routingKey = message.properties.headers.rascal.originalRoutingKey
        if (message.properties.headers.rascal.originalExchange) message.fields.exchange = message.properties.headers.rascal.originalExchange
        return message
    }

    function ackOrNack(channel, message, err, options) {
        if (arguments.length === 3) return ackOrNack(channel, message, err, {})
        if (err && options.republish) return republish(channel, message, options)
        if (err) return nack(channel, message, options)
        ack(channel, message)
    }

    function ack(channel, message) {
        debug('Acknowledging message', message.properties.messageId)
        channel.ack(message)
    }

    function republish(subscriberChannel, message, options) {
        debug('Republishing message: %s with options:', message.properties.messageId, options)
        if (options.defer) return setTimeout(republish.bind(null, subscriberChannel, message, { republish: true }), options.defer).unref()

        var republished = message.properties.headers.rascal && message.properties.headers.rascal.republished || 0

        if (options.attempts &&  options.attempts <= republished) {
            debug('Message: %s has been republished %d times. Nacking without requeue.', message.properties.messageId, republished)
            return nack(subscriberChannel, message, { requeue: false })
        }

        var publishOptions = _.defaultsDeep(message.properties, { headers: { rascal: {} } })
        publishOptions.headers.rascal.republished = republished + 1
        publishOptions.headers.rascal.originalExchange = message.fields.exchange
        publishOptions.headers.rascal.originalRoutingKey = message.fields.routingKey

        vhost.getConfirmChannel(function(err, publisherChannel) {
            publisherChannel.sendToQueue(config.source, message.content, publishOptions, function(err) {
                if (err) {
                    debug('Message: %s failed to be republished. Nacking with requeue. Original error was: %s', message.properties.messageId, err.message)
                    nack(subscriberChannel, err, message, { requeue: true })
                } else {
                    debug('Message: %s was republished to %s', message.properties.messageId, config.source)
                    ack(subscriberChannel, message)
                }
            })
        })
    }

    function nack(channel, message, options) {
        debug('Not acknowledging message: %s with options:', message.properties.messageId, options)
        if (options.requeue && options.defer) return setTimeout(nack.bind(null, channel, message, { requeue: true }), options.defer).unref()
        channel.nack(message, false, !!options.requeue)
    }

    function handleChannelError(session, config, err) {
        debug('Handling channel error: %s from %s', err.message, config.name)
        session.emit('error', err)
        config.retry && _subscribe(session, config, function(err) {
            if (err) return setTimeout(handleChannelError.bind(null, session, config, err), config.retry.delay)
        })
    }
}

