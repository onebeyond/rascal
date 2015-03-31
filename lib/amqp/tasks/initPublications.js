'use strict'

var debug = require('debug')('amqp-nice:tasks:initVhosts')
var format = require('util').format
var _ = require('lodash')
var async = require('async')
var Publication = require('../Publication')

module.exports = _.curry(function(config, ctx, next) {
    ctx.publications = {}
    async.eachSeries(_.values(config.publications), function(publicationConfig, callback) {
        initPublication(publicationConfig, ctx, function(err, publication) {
            ctx.publications[publicationConfig.name] = publication
            callback()
        })
    }, function(err) {
        next(err, config, ctx)
    })
})

function initPublication(config, ctx, next) {
    Publication.create(ctx.vhosts[config.vhost], config, next)
}