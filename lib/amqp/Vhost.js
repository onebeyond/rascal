var debug = require('debug')('rascal:Vhost')
var format = require('util').format
var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter
var async = require('async')
var forwardEvents = require('forward-emitter')
var Pool = require('generic-pool').Pool
var tasks = require('./tasks')

module.exports = {
    create: function(config, next) {
        new Vhost(config).init(next)
    }
}

inherits(Vhost, EventEmitter)

function Vhost(config) {

    var self = this
    var connection
    var connectionConfig
    var channelPool = createChannelPool({ confirm: false })
    var confirmChannelPool = createChannelPool({ confirm: true })
    var channelCreator = async.queue(createChannel, 1)

    var init = async.compose(tasks.closeChannel, tasks.applyBindings, tasks.purgeQueues, tasks.checkQueues, tasks.assertQueues, tasks.checkExchanges, tasks.assertExchanges, tasks.createChannel, tasks.createConnection)
    var bounce = async.compose(init, tasks.closeConnection)
    var purge = async.compose(tasks.closeConnection, tasks.closeChannel, tasks.purgeQueues, tasks.createChannel, tasks.createConnection)
    var nuke = async.compose(tasks.closeConnection, tasks.closeChannel, tasks.deleteQueues, tasks.deleteExchanges, tasks.createChannel, tasks.createConnection)

    pauseChannelAllocation()

    this.name = config.name

    this.init = function(next) {
        debug(format('Initialising vhost: %s', config.name))
        pauseChannelAllocation()
        init(config, {}, function(err, config, ctx) {
            if (err) return next(err)
            self.emit('connect')
            ctx.connection.removeAllListeners('error')
            ctx.connection.once('error', handleConnectionError.bind(null, config))
            forwardEvents(ctx.connection, self, function(eventName) {
                return eventName === 'blocked' || eventName === 'unblocked';
            })
            connection = ctx.connection
            connectionConfig = ctx.connectionConfig
            resumeChannelAllocation()
            return next(null, self)
        })
        return self
    }

    this.nuke = function(next) {
        debug(format('Nuking vhost: %s', config.name))
        pauseChannelAllocation()
        nuke(config, {}, function(err, config, ctx) {
            if (err) return next(err)
            connection = undefined
            debug(format('Finished nuking vhost: %s', config.name))
            setImmediate(next)
        })
    }

    this.purge = function(next) {
        debug(format('Purging vhost: %s', config.name))
        purge(config, { purge: true }, function(err, config, ctx) {
            if (err) return next(err)
            debug(format('Finished purging vhost: %s', config.name))
            setImmediate(next)
        })
    }

    this.bounce = function(next) {
        debug(format('Bouncing vhost: %s', config.name))
        pauseChannelAllocation()
        bounce(config, {}, function() {
            setImmediate(next)
        })
    }

    this.disconnect = function(next) {
        debug(format('Disconnecting vhost: %s', config.name))
        pauseChannelAllocation()
        if (!connection) return next()
        connection.removeAllListeners()
        connection.on('error', function(err) {
            debug(format('Error disconnecting from %s. Original error was: %s', connectionConfig.loggableUrl, err.message))
        })
        connection.close(next)
    }

    this.getChannel = function(next) {
        channelCreator.push({ confirm: false }, next)
        debug(format('Requested channel. Outstanding channel requests: %d', channelCreator.length()))
    }

    this.getConfirmChannel = function(next) {
        channelCreator.push({ confirm: true }, next)
        debug(format('Requested confirm channel. Outstanding channel requests: %d', channelCreator.length()))
    }

    this.borrowChannel = channelPool.borrow
    this.returnChannel = channelPool.return
    this.borrowConfirmChannel = confirmChannelPool.borrow
    this.returnConfirmChannel = confirmChannelPool.return

    function createChannelPool(options) {
        var pool = new Pool({
            max: 5,
            create: function(next) {
                createChannel(options, function(err, channel) {
                    if (err) return next(err)
                    channel.once('error', markClosed)
                    channel.once('close', markClosed)
                    next(null, channel)

                    function markClosed() {
                        channel._rascal_closed = true
                    }
                })
            },
            destroy: function(channel) {
                if (!channel._rascal_closed) channel.close()
            },
            refreshIdle: false,
            validate: function(channel) {
                return !channel._rascal_closed && connection.connection === channel.connection
            }
        })
        var poolQueue = async.queue(function(__, next) {
            pool.acquire(next)
        }, 1)
        return {
            borrow: poolQueue.push.bind(poolQueue, null),
            return: pool.release.bind(pool),
            pause: poolQueue.pause.bind(poolQueue),
            resume: poolQueue.resume.bind(poolQueue)
        }
    }

    function createChannel(options, next) {
        options.confirm ? connection.createConfirmChannel(callback) : connection.createChannel(callback)

        function callback(err, channel) {
            if (err) return next(err)
            channel.connection.setMaxListeners(0);
            next(null, channel)
        }
    }

    function pauseChannelAllocation() {
        channelCreator.pause()
        channelPool.pause()
        confirmChannelPool.pause()
    }

    function resumeChannelAllocation() {
        channelCreator.resume()
        channelPool.resume()
        confirmChannelPool.resume()
    }

    function handleConnectionError(config, err) {
        debug(format('Handling connection error: %s from %s', err.message, connectionConfig.loggableUrl))
        self.emit('disconnect')
        pauseChannelAllocation()
        connection = undefined
        self.emit('error', err)
        connectionConfig.retry && self.init(function(err) {
            if (err) return setTimeout(handleConnectionError.bind(null, config, err), connectionConfig.retry.delay)
        })
    }
}
