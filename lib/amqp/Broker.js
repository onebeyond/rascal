var debug = require('debug')('amqp-nice:Broker')

var format = require('util').format
var _ = require('lodash')
var async = require('async')
var tasks = require('./tasks')
var configure = require('../config/configure')
var Vhost = require('./Vhost')

module.exports = {
    create: function(config, next) {
        configure(config, function(err, config) {
            new Broker(config).init(function(err, broker) {
                next(err, broker)
            })
        })
    }
}

function Broker(config) {

    var self = this
    var paused = false
    var vhosts = {}
    var publications = {}
    var subscriptions = {}
    var init = async.compose(tasks.initSubscriptions, tasks.initPublications, tasks.initVhosts)
    var nuke = async.compose(tasks.disconnectVhost, tasks.nukeVhost)
    var disconnect = tasks.disconnectVhost
    var bounce = tasks.bounceVhost

    this.init = function(next) {
        debug('Initialising broker')
        init(config, {}, function(err, config, ctx) {
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

        if (arguments.length < 3) return this.publish(name, message, {}, _.noop)
        if (arguments.length === 3 && _.isFunction(arguments[2])) return this.publish(name, message, {}, arguments[2])
        if (arguments.length === 3) return this.publish(name, message, overrides, _.noop)
        if (_.isString(overrides)) return this.publish(name, message, { routingKey: overrides }, next)

        if (!config.publications[name]) return next(new Error(format('Unknown publication: %s', name)))

        publications[name].publish(message, overrides, next)
    }

    this.subscribe = function(name, handler, overrides, next) {

        if (arguments.length < 3) return this.subscribe(name, handler, {}, _.noop)
        if (arguments.length === 3 && _.isFunction(arguments[2])) return this.subscribe(name, handler, {}, arguments[2])
        if (arguments.length === 3) return this.subscribe(name, handler, overrides, _.noop)

        if (!config.subscriptions[name]) return next(new Error(format('Unknown subscription: %s', name)))

        subscriptions[name].subscribe(handler, overrides, next)
    }

    this.unsubscribe = function(name, consumerTag, next) {

        if (!config.subscriptions[name]) return next(new Error(format('Unknown subscription: %s', name)))

        subscriptions[name].unsubscribe(consumerTag, next)
    }
}

