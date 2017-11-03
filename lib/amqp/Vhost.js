var debug = require('debug')('rascal:Vhost')
var format = require('util').format
var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter
var async = require('async')
var forwardEvents = require('forward-emitter')
var Pool = require('generic-pool').Pool
var tasks = require('./tasks')
var uuid = require('uuid').v4
var _ = require('lodash')

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
    var channelPool = createChannelPool({ confirm: false, size: config.publicationChannelPools.regularPoolSize })
    var confirmChannelPool = createChannelPool({ confirm: true, size: config.publicationChannelPools.confirmPoolSize })
    var channelCreator = async.queue(createChannel, 1)

    var init = async.compose(tasks.closeChannel, tasks.applyBindings, tasks.purgeQueues, tasks.checkQueues, tasks.assertQueues, tasks.checkExchanges, tasks.assertExchanges, tasks.createChannel, tasks.createConnection)
    var bounce = async.compose(init, tasks.closeConnection)
    var purge = async.compose(tasks.closeConnection, tasks.closeChannel, tasks.purgeQueues, tasks.createChannel, tasks.createConnection)
    var nuke = async.compose(tasks.closeConnection, tasks.closeChannel, tasks.deleteQueues, tasks.deleteExchanges, tasks.createChannel, tasks.createConnection)

    pauseChannelAllocation()

    this.name = config.name

    this.init = function(next) {
        debug('Initialising vhost: %s', config.name)
        pauseChannelAllocation()
        init(config, {}, function(err, config, ctx) {
            if (err) return next(err)
            self.emit('connect')

            attachErrorHandlers(ctx.connection, config)

            forwardEvents(ctx.connection, self, function(eventName) {
                return eventName === 'blocked' || eventName === 'unblocked'
            })
            debug('vhost: %s was initialised with connection: %s', config.name, ctx.connection._rascal_id)
            connection = ctx.connection
            connectionConfig = ctx.connectionConfig
            resumeChannelAllocation()
            return next(null, self)
        })
        return self
    }

    this.nuke = function(next) {
        debug('Nuking vhost: %s', config.name)
        pauseChannelAllocation()
        nuke(config, {}, function(err, config, ctx) {
            if (err) return next(err)
            connection = undefined
            debug('Finished nuking vhost: %s', config.name)
            setImmediate(next)
        })
    }

    this.purge = function(next) {
        debug('Purging vhost: %s', config.name)
        purge(config, { purge: true }, function(err, config, ctx) {
            if (err) return next(err)
            debug('Finished purging vhost: %s', config.name)
            setImmediate(next)
        })
    }

    this.bounce = function(next) {
        debug('Bouncing vhost: %s', config.name)
        pauseChannelAllocation()
        bounce(config, {}, function() {
            setImmediate(next)
        })
    }

    this.disconnect = function(next) {
        debug('Disconnecting vhost: %s', config.name)
        pauseChannelAllocation()
        if (!connection) return next()
        connection.removeAllListeners()
        connection.on('error', function(err) {
            debug('Error disconnecting from %s. Original error was: %s', connectionConfig.loggableUrl, err.message)
        })
        connection.close(next)
    }

    this.getChannel = function(next) {
        channelCreator.push({ confirm: false }, next)
        debug('Requested channel. Outstanding channel requests: %d', channelCreator.length())
    }

    this.getConfirmChannel = function(next) {
        channelCreator.push({ confirm: true }, next)
        debug('Requested confirm channel. Outstanding channel requests: %d', channelCreator.length())
    }

    this.borrowChannel = channelPool.borrow
    this.returnChannel = channelPool.return
    this.borrowConfirmChannel = confirmChannelPool.borrow
    this.returnConfirmChannel = confirmChannelPool.return

    function createChannelPool(options) {
        var displayType = options.confirm ? ' confirm' : '';
        var pool = new Pool({
            max: options.size,
            create: function(next) {
                channelCreator.push(options, function(err, channel) {
                    if (err) return next(err)
                    var releaseChannel = _.once(function() {
                        channel._rascal_closed = true
                        pool.release(channel);
                    })
                    channel.once('error', releaseChannel)
                    channel.once('close', releaseChannel)
                    next(null, channel)

                })
            },
            destroy: function(channel) {
                if (!channel._rascal_closed) channel.close()
            },
            refreshIdle: false,
            validate: function(channel) {
                return !channel._rascal_closed && connection && connection.connection === channel.connection
            }
        })
        var poolQueue = async.queue(function(__, next) {
            pool.acquire(next)
        }, 1)

        function stats() {
            return format('Queue size: %d, pool size: %d, available: %d, taken: %d',
                poolQueue.length(), pool.getPoolSize(), pool.availableObjectsCount(), pool.inUseObjectsCount())
        }

        function borrow(next) {
            debug('Requested%s channel. %s', displayType, stats())
            poolQueue.push(null, function (err, channel) {
                if (err) return next(err);
                debug('Borrowed%s channel: %s. %s', displayType, channel._rascal_id, stats())
                next(null, channel)
            })
        }

        function release(channel) {
            debug('Returning%s channel: %s. %s', displayType, channel._rascal_id, stats())
            pool.release(channel)
        }

        return {
            borrow: borrow,
            return: release,
            pause: poolQueue.pause.bind(poolQueue),
            resume: poolQueue.resume.bind(poolQueue)
        }
    }

    function createChannel(options, next) {
        options.confirm ? connection.createConfirmChannel(callback) : connection.createChannel(callback)

        function callback(err, channel) {
            if (err) return next(err)
            channel._rascal_id = uuid();
            debug('Created channel %s from connection: %s', channel._rascal_id, connection._rascal_id)
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

    function attachErrorHandlers(connection, config) {
        connection.removeAllListeners('error')
        var errorHandler = _.once(handleConnectionError.bind(null, connection, config))
        connection.once('error', errorHandler)
        connection.once('close', errorHandler)
    }

    function handleConnectionError(borked, config, err) {
        debug('Handling connection error: %s from %s using channel: %s', err.message, borked._rascal_id, connectionConfig.loggableUrl)
        self.emit('disconnect')
        pauseChannelAllocation()
        connection = undefined
        self.emit('error', err)
        connectionConfig.retry && self.init(function(err) {
            if (err) return setTimeout(handleConnectionError.bind(null, borked, config, err), connectionConfig.retry.delay).unref()
        })
    }
}
