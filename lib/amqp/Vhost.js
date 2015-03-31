var debug = require('debug')('amqp-nice:Broker')

var format = require('util').format
var _ = require('lodash')
var async = require('async')
var when = require('when')
var tasks = require('./tasks')
var configure = require('../config/configure')

module.exports = {
    create: function(config, next) {
        new Vhost(config).init(next)
    }
}

function Vhost(config) {

    var self = this
    var connectionPromise = undefined
    var connection = undefined
    var channels = {}
    var init = async.compose(tasks.closeChannel, tasks.applyBindings, tasks.checkQueues, tasks.assertQueues, tasks.checkExchanges, tasks.assertExchanges, tasks.createChannel, tasks.connect)
    var nuke = async.compose(tasks.closeConnection, tasks.closeChannel, tasks.deleteQueues, tasks.deleteExchanges, tasks.createChannel, tasks.connect)

    this.init = function(next) {
        debug(format('Initialising vhost: %s', config.name))
        connectionPromise = when.promise(function(resolve, reject) {
            if (connection) return resolve(connection)
            init(config, {}, function(err, config, ctx) {
                if (err) return reject(err)
                if (config.connection.retry) ctx.connection.once('error', handleConnectionError.bind(null, config))
                connection = ctx.connection
                return resolve(connection)
            })
        })

        connectionPromise.then(function() {
            next(null, self)
        }).catch(function(err) {
            next(err)
        })
    }

    this.nuke = function(next) {
        debug(format('Nuking vhost: %s', config.name))
        connection = undefined
        nuke(config, {}, function(err, config, ctx) {
            if (err) return next(err)
            debug(format('Finished nuking vhost: %s', config.name))
            next()
        })
    }

    this.getChannel = function(next) {
        connectionPromise.then(function(connection) {
            return when.promise(function(resolve, reject) {
                connection.createChannel(function(err, channel) {
                    if (err) return reject(err)
                    channel.on('error', handleChannelError)
                    return resolve(channel)
                })
            })
        }).then(function(channel) {
            next(null, channel)
        }).catch(function(err) {
            debug(format('Received error: %s', err.message))
        })
    }

    function handleConnectionError(config, err) {
        debug(format('Handling connection error: %s from %s', err.message, config.connection.loggableUrl))
        connection = undefined
        self.init(function(err) {
            if (err) return setTimeout(handleConnectionError.bind(null, config, err), config.connection.retry.delay)
        })
    }

    function handleChannelError(config, err) {
        debug(format('Handling channel error: %s from %s', err.message, config.connection.loggableUrl))
    }
}


