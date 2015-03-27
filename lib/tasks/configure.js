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

function configureObjects(type, config, ctx) {
    _.each(config[type], function(options, name) {
        debug(format('Configuring %s: %s', type, name))
        config[type][name] = _.defaultsDeep(options, config.defaults[type])
        config[type][name].fullyQualifiedName = config.namespace ? config.namespace + ':' + name : name
    })
}

function configureBindings(config, ctx) {
    _.each(config.bindings, function(binding, index) {
        debug(format('Configuring binding: %s -> %s', binding.source, binding.destination))
        config.bindings[index] = _.defaultsDeep(binding, config.defaults.bindings)
    })
}

function configurePublications(config, ctx) {
    var exchangePublications = _.map(config.exchanges, toPublication(config, 'exchange'))
    var queuePublications = _.map(config.queues, toPublication(config, 'queue'))
    config.publications = _.chain(exchangePublications).concat(queuePublications).indexBy(function(object) {
        return object.alias || object.name
    }).value()
}

var toPublication = _.curry(function(config, type, object, name) {
    return _.defaultsDeep({ name: name, fullyQualifiedName: object.fullyQualifiedName, type: type }, config.defaults.publications)
})