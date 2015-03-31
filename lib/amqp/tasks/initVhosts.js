'use strict'

var debug = require('debug')('amqp-nice:tasks:initVhosts')
var format = require('util').format
var _ = require('lodash')
var async = require('async')
var Vhost = require('../Vhost')

module.exports = _.curry(function(config, ctx, next) {
    ctx.vhosts = {}
    async.eachSeries(_.values(config.vhosts), function(vhostConfig, callback) {
        initVhost(vhostConfig, function(err, vhost) {
            if (err) return callback(err)
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