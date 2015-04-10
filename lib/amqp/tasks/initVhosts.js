'use strict'

var debug = require('debug')('rascal:tasks:initVhosts')
var format = require('util').format
var _ = require('lodash')
var async = require('async')
var forwardEvents = require('forward-emitter')
var Vhost = require('../Vhost')

module.exports = _.curry(function(config, ctx, next) {
    ctx.vhosts = {}
    async.eachSeries(_.values(config.vhosts), function(vhostConfig, callback) {
        initVhost(vhostConfig, function(err, vhost) {
            if (err) return callback(err)
            forwardEvents(vhost, ctx.broker)
            ctx.vhosts[vhostConfig.name] = vhost
            callback()
        })
    }, function(err) {
        next(err, config, ctx)
    })
})

function initVhost(config, next) {
    Vhost.create(config, next)
}