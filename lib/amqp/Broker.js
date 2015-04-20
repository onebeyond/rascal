var debug = require('debug')('rascal:Broker')
var format = require('util').format
var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter
var _ = require('lodash')
var async = require('async')
var tasks = require('./tasks')
var configure = require('../config/configure')
var validate = require('../config/validate')
var preflight = async.compose(validate, configure)
var Vhost = require('./Vhost')

module.exports = {
    create: function(config, next) {
        preflight(config, function(err, config) {
            if (err) return next(err)
            new Broker(config).init(next)
        })
    }
}

inherits(Broker, EventEmitter)

function Broker(config) {

    var self = this
    var paused = false
    var vhosts = {}
    var publications = {}
    var subscriptions = {}
    var init = async.compose(tasks.initSubscriptions, tasks.initPublications, tasks.initVhosts)
    var nuke = async.compose(tasks.disconnectVhost, tasks.nukeVhost)
    var purge = tasks.purgeVhost
    var disconnect = tasks.disconnectVhost
    var bounce = tasks.bounceVhost

    this.init = function(next) {
        debug('Initialising broker')
        init(config, { broker: self }, function(err, config, ctx) {
            vhosts = ctx.vhosts
            publications = ctx.publications
            subscriptions = ctx.subscriptions
            setImmediate(function() {
                next(err, self)
            })
        })
    }

    this.nuke = function(next) {
        debug('Nuking broker')
        async.eachSeries(_.values(vhosts), function(vhost, callback) {
            nuke(config, { vhost: vhost }, callback)
        }, function(err) {
            if (err) return next(err)
            debug('Finished nuking broker')
            next()
        })
    }

    this.purge = function(next) {
        debug('Purging all queues in all vhosts')
        async.eachSeries(_.values(vhosts), function(vhost, callback) {
            purge(config, { vhost: vhost }, callback)
        }, function(err) {
            if (err) return next(err)
            debug('Finished purging all queues in all vhosts')
            next()
        })
    }

    this.shutdown = function(next) {
        debug('Shutting down broker')
        async.eachSeries(_.values(vhosts), function(vhost, callback) {
            disconnect(config, { vhost: vhost }, callback)
        }, function(err) {
            if (err) return next(err)
            debug('Finished shutting down broker')
            next()
        })
    }

    this.bounce = function(next) {
        debug('Bouncing broker')
        async.eachSeries(_.values(vhosts), function(vhost, callback) {
            bounce(config, { vhost: vhost }, callback)
        }, function(err) {
            if (err) return next(err)
            debug('Finished bouncing broker')
            next()
        })
    }

    this.publish = function(name, message, overrides, next) {
        if (arguments.length < 3) return self.publish(name, message, {}, _.noop)
        if (arguments.length === 3 && _.isFunction(arguments[2])) return self.publish(name, message, {}, arguments[2])
        if (arguments.length === 3) return self.publish(name, message, overrides, _.noop)
        if (_.isString(overrides)) return self.publish(name, message, { routingKey: overrides }, next)

        return _publish(name, message, overrides, next)
    }

    function _publish(name, message, overrides, next) {
        if (!config.publications[name]) return next(new Error(format('Unknown publication: %s', name)))
        return publications[name].publish(message, overrides, next)
    }

    this.subscribe = function(name, handler, overrides, next) {
        if (arguments.length < 3) return _subscribe(name, handler, {}, _.noop)
        if (arguments.length === 3 && _.isFunction(arguments[2])) return _subscribe(name, handler, {}, arguments[2])
        if (arguments.length === 3) return _subscribe(name, handler, overrides, _.noop)
        return _subscribe(name, handle, override, next)
    }

    function _subscribe(name, handler, overrides, next) {
        if (!config.subscriptions[name]) return next(new Error(format('Unknown subscription: %s', name)))
        return subscriptions[name].subscribe(handler, overrides, next)
    }

    this.unsubscribe = function(name, consumerTag, next) {
        if (!config.subscriptions[name]) return next(new Error(format('Unknown subscription: %s', name)))
        subscriptions[name].unsubscribe(consumerTag, next)
    }
}

