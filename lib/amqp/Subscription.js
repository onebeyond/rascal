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
        var subscribeConfig = _.defaultsDeep(overrides, config)
        debug(format('Subscribing to queue: %s', subscribeConfig.queue))

        vhost.getChannel(function(err, channel) {
            if (err) return next(err)
            channel.consume(subscribeConfig.source, function(message) {
                debug('Received message from queue: %s', subscribeConfig.queue)
                getContent(message, function(err, content) {
                    handler(err, message, content)
                })
            }, subscribeConfig.options)
            next()
        })
    }

    function getContent(message, next) {
        if (!message.properties.contentType) return next(null, message.content)
        if (message.properties.contentType === 'text/plain') return next(null, message.content.toString())
        if (message.properties.contentType === 'application/json') return safeParse(new String(message.content), next)
    }
}

