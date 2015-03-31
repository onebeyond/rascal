var debug = require('debug')('amqp-nice:Broker')

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
    var counter = 0;

    var init = async.compose(tasks.closeChannel, tasks.applyBindings, tasks.checkQueues, tasks.assertQueues, tasks.checkExchanges, tasks.assertExchanges, tasks.createChannel, tasks.connect)
    var nuke = async.compose(tasks.closeConnection, tasks.closeChannel, tasks.deleteQueues, tasks.deleteExchanges, tasks.createChannel, tasks.connect)

    this.init = function(next) {
        debug(format('Initialising vhost: %s', config.name))
        init(config, {}, function(err, config, ctx) {
            if (err) return next(err)
            if (config.connection.retry) ctx.connection.once('error', handleConnectionError.bind(null, config))
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
            debug(format('Finished nuking vhost: %s', config.name))
            next()
        })
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
            channel.once('error', handleChannelError.bind(null, config))
            next(null, channel)
        }
    }

    function handleConnectionError(config, err) {
        debug(format('Handling connection error: %s from %s', err.message, config.connection.loggableUrl))
        channelAllocator.pause()
        self.init(function(err) {
            if (err) return setTimeout(handleConnectionError.bind(null, config, err), config.connection.retry.delay)
        })
    }

    function handleChannelError(config, err) {
        debug(format('Handling channel error: %s from %s', err.message, config.connection.loggableUrl))
    }
}


