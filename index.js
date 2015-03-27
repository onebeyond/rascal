'use strict'

var debug = require('debug')('amqp-nice')
var format = require('util').format
var _ = require('lodash').runInContext()
var async = require('async')
var tasks = require('./lib/tasks')

_.mixin({ 'defaultsDeep': require('merge-defaults') });

var defaultConfig = {
    defaults: {
        exchanges: {
            assert: true,
            type: 'topic',
            options: {
            }
        },
        queues: {
            assert: true,
            options: {
            }
        },
        bindings: {
            destinationType: 'queue',
            arguments: {}
        },
        publications: {
            options: {
                persistent: true
            }
        }
    },
    connection: {
        slashes:true,
        protocol: 'amqp',
        hostname: 'localhost',
        user: 'guest',
        password: 'guest',
        port: '5672',
        vhost: '',
        options: {
            heartbeat: 5
        },
        get auth() { return this.user + ':' + this.password },
        get pathname() { return this.vhost },
        get query() { return this.options }
    },
    channel: {
        onError: function(config, ctx, err) {
            console.error("Oh No", err.message)
        },
        onClose: function(config, ctx) {
            debug('Channel closed', ctx.channel)
        }
    },
    exchanges: {
    },
    queues: {
    },
    bindings: [
    ],
    publications: {
    }
}

module.exports = (function() {

    function init(overrides, next) {
        if (arguments.length === 1) return init({}, arguments[0])

        var config = _.defaultsDeep(overrides, defaultConfig)

        var pipeline = async.compose(
            tasks.applyBindings,
            tasks.purgeQueues,
            tasks.checkQueues,
            tasks.assertQueues,
            tasks.checkExchanges,
            tasks.assertExchanges,
            tasks.createChannel,
            tasks.connect,
            tasks.configure
        )

        pipeline(config, {}, function(err, config, ctx) {
            next && next(err, {
                config: config,
                connection: ctx.connection,
                channel: ctx.channel,
                publish: publish.bind(null, config, ctx),
                nuke: nuke.bind(null, config, ctx)
            })
        })
    }

    function publish(config, ctx, name, overrides, message, next) {

        if (arguments.length === 5 && _.isFunction(arguments[4])) return publish(config, ctx, name, {}, arguments[3], arguments[4])

        var publication = config.publications[name]
        var routingKey = _.isString(overrides) ? overrides : overrides.routingKey
        var content = getContent(message)

        if (!publication) return next(new Error(format('Unknown publication: %s', name)))
        if (publication.type === 'exchange') {
            debug(format('Publishing %d bytes to exchange: %s with routingKey: %s', message.length, publication.fullyQualifiedName, routingKey))
            ctx.channel.publish(publication.fullyQualifiedName, routingKey, content, publication.options)
            next()
        } else if (publication.type === 'queue') {
            debug(format('Publishing %d bytes to queue: %s', message.length, publication.fullyQualifiedName))
            ctx.channel.sendToQueue(publication.fullyQualifiedName, content, publication.options)
            next()
        } else {
            return next(new Error(format('Unsupported publication type: %s', publication.type)))
        }
    }

    function getContent(message) {
        return Buffer.isBuffer(message) ? message
                                        : _.isString(message) ? new Buffer(message)
                                                              : new Buffer(JSON.stringify(message))
    }

    function nuke(config, ctx, next) {
        var pipeline = async.compose(
            tasks.closeConnection,
            tasks.deleteQueues,
            tasks.deleteExchanges
        )

        pipeline(config, ctx, function(err, config, ctx) {
            next(err)
        })
    }

    return {
        init: init
    }
})()