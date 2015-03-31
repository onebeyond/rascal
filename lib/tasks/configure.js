'use strict'

var debug = require('debug')('amqp-nice:tasks:configure')
var format = require('util').format
var url = require('url')
var _ = require('lodash').runInContext()


_.mixin({ 'defaultsDeep': require('merge-defaults') });

module.exports = _.curry(function(config, ctx, next) {
    configureConnection(config, ctx)
    configureExchanges(config, ctx)
    configureQueues(config, ctx)
    configureBindings(config, ctx)
    configurePublications(config, ctx)
    next(null, config, ctx)
})

function configureConnection(config, ctx) {
    if (config.connection.url) return
    config.connection.url = url.format(config.connection)
}

var configureExchanges = _.curry(configureObjects)('exchanges')
var configureQueues = _.curry(configureObjects)('queues')
var configureBindings = _.curry(configureObjects)('bindings')
var configurePublications = _.curry(configureObjects)('publications')

function configureObjects(type, config, ctx) {
    _.each(config[type], function(options, name) {
        debug(format('Configuring %s: %s', type, name))
        config[type][name] = _.defaultsDeep(options, config.defaults[type])
        config[type][name].fullyQualifiedName = config.namespace ? config.namespace + ':' + name : name
    })
}
