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
var stub = require('../counters/stub')
var inMemory = require('../counters/inMemory')
var inMemoryCluster = require('../counters/inMemoryCluster').worker

module.exports = {
    create: function(config, components, next) {
        if (arguments.length === 2) return this.create(config, {}, arguments[1])
        preflight(_.cloneDeep(config), function(err, config) {
            if (err) return next(err)
            new Broker(config, components).init(next)
        })
    }
}

inherits(Broker, EventEmitter)

function Broker(config, components) {

    var self = this
    var vhosts = {}
    var publications = {}
    var subscriptions = {}
    var sessions = []
    var init = async.compose(tasks.initShovels, tasks.initSubscriptions, tasks.initPublications, tasks.initCounters, tasks.initVhosts)
    var nuke = async.compose(tasks.disconnectVhost, tasks.nukeVhost)
    var purge = tasks.purgeVhost
    var disconnect = tasks.disconnectVhost
    var bounce = tasks.bounceVhost
    var counters = _.defaults({}, components.counters, { stub: stub, inMemory: inMemory, inMemoryCluster: inMemoryCluster })

    this.config = config

    this.init = function(next) {
        debug('Initialising broker')
        init(config, { broker: self, components: { counters: counters } }, function(err, config, ctx) {
            vhosts = ctx.vhosts
            publications = ctx.publications
            subscriptions = ctx.subscriptions
            sessions = []
            setImmediate(function() {
                next(err, self)
            })
        })
        return this
    }

    this.nuke = function(next) {
        debug('Nuking broker')
        self.unsubscribeAll(function(err) {
            if (err) return next(err)
            async.eachSeries(_.values(vhosts), function(vhost, callback) {
                nuke(config, { vhost: vhost }, callback)
            }, function(err) {
                if (err) return next(err)
                vhosts = publications = subscriptions = {}
                debug('Finished nuking broker')
                next()
            })
        })
        return this
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
        return this
    }

    this.shutdown = function(next) {
        debug('Shutting down broker')
        self.unsubscribeAll(function(err) {
            if (err) return next(err)
            async.eachSeries(_.values(vhosts), function(vhost, callback) {
                disconnect(config, { vhost: vhost }, callback)
            }, function(err) {
                if (err) return next(err)
                debug('Finished shutting down broker')
                next()
            })
        })
        return this
    }

    this.bounce = function(next) {
        debug('Bouncing broker')
        self.unsubscribeAll(function(err) {
            if (err) return next(err)
            async.eachSeries(_.values(vhosts), function(vhost, callback) {
                bounce(config, { vhost: vhost }, callback)
            }, function(err) {
                if (err) return next(err)
                debug('Finished bouncing broker')
                next()
            })
        })
        return this
    }

    this.publish = function(name, message, overrides, next) {
        if (arguments.length === 3) return self.publish(name, message, {}, arguments[2])
        if (_.isString(overrides)) return self.publish(name, message, { routingKey: overrides }, next)
        if (!publications[name]) return next(new Error(format('Unknown publication: %s', name)))
        publications[name].publish(message, overrides, next)
        return this
    }

    this.forward = function(name, message, overrides, next) {
        if (arguments.length === 3) return self.forward(name, message, {}, arguments[2])
        if (_.isString(overrides)) return self.forward(name, message, { routingKey: overrides }, next)
        if (!config.publications[name]) return next(new Error(format('Unknown publication: %s', name)))
        publications[name].forward(message, overrides, next)
        return this
    }

    this.subscribe = function(name, overrides, next) {
        if (arguments.length === 2) return self.subscribe(name, {}, arguments[1])
        if (!subscriptions[name]) return next(new Error(format('Unknown subscription: %s', name)))
        subscriptions[name].subscribe(overrides, function(err, session) {
            if(err) return next(err)
            sessions.push(session)
            next(null, session)
        })
        return this
    }

    this.unsubscribeAll = function(next) {
        async.eachSeries(sessions.slice(), function(session, cb) {
            sessions.shift()
            session.cancel(cb)
        }, next)
    }

    this.getFullyQualifiedName = this.qualify = function(vhost, name) {
        return fqn.qualify(name, config.vhosts[vhost].namespace)
    }
}
