var debug = require('debug')('amqp-nice:Broker')

var EventEmitter = require('events').EventEmitter
var format = require('util').format
var _ = require('lodash')
var async = require('async')
var tasks = require('./tasks')
var configure = require('../config/configure')
var Vhost = require('./Vhost')

module.exports = {
    create: function(config, next) {
        configure(config, function(err, config) {
            new Broker(config).init(next)
        })
    }
}

function Broker(config) {

    var self = this
    var paused = false
    var vhosts = {}
    var publications = {}
    var init = async.compose(tasks.initPublications, tasks.initVhosts)

    this.init = function(next) {
        debug('Initialising broker')
        init(config, {}, function(err, config, ctx) {
            vhosts = ctx.vhosts
            publications = ctx.publications
            next(err, self)
        })
    }

    this.nuke = function(next) {
        debug('Nuking broker')
        async.eachSeries(_.values(vhosts), nukeVhost, function(err) {
            if (err) return next(err)
            debug('Finished nuking broker')
            next()
        })
    }

    function nukeVhost(vhost, next) {
        vhost.nuke(next)
    }

    this.publish = function(name, message, overrides, next) {

        if (arguments.length < 3) return this.publish(name, message, {}, _.noop)
        if (arguments.length === 3 && _.isFunction(arguments[2])) return this.publish(name, message, {}, arguments[2])
        if (arguments.length === 3) return this.publish(name, message, overrides, _.noop)
        if (_.isString(overrides)) return this.publish(name, message, { routingKey: overrides }, next)

        if (!config.publications[name]) return next(new Error(format('Unknown publication: %s', name)))

        publications[name].publish(message, overrides, next)
    }
}

Broker.prototype = Object.create(EventEmitter.prototype);

