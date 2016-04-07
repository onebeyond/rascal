var debug = require('debug')('rascal:Broker')
var format = require('util').format
var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter
var _ = require('lodash')
var async = require('async')
var tasks = require('./tasks')
var configure = require('../config/configure')
var validate = require('../config/validate')
var fqn = require('../config/fqn')
var preflight = async.compose(validate, configure)
var Vhost = require('./Vhost')
var Publication = require('./Publication')

module.exports = {
    create: function(config, next) {
        preflight(_.cloneDeep(config), function(err, config) {
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
    var init = async.compose(tasks.initShovels, tasks.initSubscriptions, tasks.initPublications, tasks.initVhosts)
    var nuke = async.compose(tasks.disconnectVhost, tasks.nukeVhost)
    var purge = tasks.purgeVhost
    var disconnect = tasks.disconnectVhost
    var bounce = tasks.bounceVhost

    this.config = config

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
            vhosts = publications = subscriptions = {}
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
        if (arguments.length === 3) return self.publish(name, message, {}, arguments[2])
        if (_.isString(overrides)) return self.publish(name, message, { routingKey: overrides }, next)
        if (!publications[name]) return next(new Error(format('Unknown publication: %s', name)))
        publications[name].publish(message, overrides, next)
    }

    this.forward = function(name, message, overrides, next) {
        if (arguments.length === 3) return self.forward(name, message, {}, arguments[2])
        if (_.isString(overrides)) return self.forward(name, message, { routingKey: overrides }, next)
        if (!config.publications[name]) return next(new Error(format('Unknown publication: %s', name)))
        publications[name].forward(message, overrides, next)
    }

    this.subscribe = function(name, overrides, next) {
        if (arguments.length === 2) return self.subscribe(name, {}, arguments[1])
        if (!subscriptions[name]) return next(new Error(format('Unknown subscription: %s', name)))
        subscriptions[name].subscribe(overrides, next)
    }

    this.getFullyQualifiedName = this.qualify = function(vhost, name) {
        return fqn.qualify(name, config.vhosts[vhost].namespace)
    }
}

