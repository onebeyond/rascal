var debug = require('debug')('amqp-nice:Vhost')

var format = require('util').format
var _ = require('lodash')
var async = require('async')
var tasks = require('./tasks')
var configure = require('../config/configure')

module.exports = {
    create: function(config, next) {
        new Vhost(config).init(next)
    }
}

function Vhost(config) {

    var self = this
    var connection = undefined
    var channelAllocator = async.queue(createChannel, 1);

    var init = async.compose(tasks.closeChannel, tasks.applyBindings, tasks.checkQueues, tasks.assertQueues, tasks.checkExchanges, tasks.assertExchanges, tasks.createChannel, tasks.createConnection)
    var bounce = async.compose(init, tasks.closeConnection)
    var nuke = async.compose(tasks.closeConnection, tasks.closeChannel, tasks.deleteQueues, tasks.deleteExchanges, tasks.createChannel, tasks.createConnection)

    this.init = function(next) {
        debug(format('Initialising vhost: %s', config.name))
        channelAllocator.pause()
        init(config, {}, function(err, config, ctx) {
            if (err) return next(err)
            // TODO its possible a connection error has already triggered an init cycle, so may need to disconnect again
            ctx.connection.removeAllListeners('error')
            // if (config.connection.retry) ctx.connection.once('error', handleConnectionError.bind(null, config))
            connection = ctx.connection
            channelAllocator.resume()
            return next(null, self)
        })
    }

    this.nuke = function(next) {
        debug(format('Nuking vhost: %s', config.name))
        channelAllocator.pause()
        nuke(config, {}, function(err, config, ctx) {
            if (err) return next(err)
            connection = undefined
            debug(format('Finished nuking vhost: %s', config.name))
            next()
        })
    }

    this.bounce = function(next) {
        debug(format('Bouncing vhost: %s', config.name))
        channelAllocator.pause()
        bounce(config, {}, next)
    }

    this.disconnect = function(next) {
        debug(format('Disconnecting vhost: %s', config.name))
        channelAllocator.pause()
        if (!connection) return next()
        connection.removeAllListeners()
        connection.on('error', function(err) {
            debug(format('Error disconnecting from %s', config.connection.loggableUrl))
        })
        connection.close(next)
    }

    this.getChannel = function(next) {
        channelAllocator.push({ confirm: false }, next)
        debug(format('Requested channel. Outstanding channel requests: %d', channelAllocator.length()))
    }

    this.getConfirmChannel = function(next) {
        channelAllocator.push({ confirm: true }, next)
        debug(format('Requested confirm channel. Outstanding channel requests: %d', channelAllocator.length()))
    }

    function createChannel(options, next) {
        options.confirm ? connection.createConfirmChannel(callback) : connection.createChannel(callback)

        function callback(err, channel) {
            if (err) return next(err)
            next(null, channel)
        }
    }

    function handleConnectionError(config, err) {
        debug(format('Handling connection error: %s from %s', err.message, config.connection.loggableUrl))
        channelAllocator.pause()
        connection = undefined
        self.init(function(err) {
            if (err) return setTimeout(handleConnectionError.bind(null, config, err), config.connection.retry.delay)
        })
    }
}


