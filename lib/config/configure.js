'use strict'

var debug = require('debug')('rascal:config:configure')
var format = require('util').format
var url = require('url')
var _ = require('lodash').runInContext().mixin({ 'defaultsDeep': require('merge-defaults') })
var uuid = require('node-uuid').v4
var emptyConfig = require('./empty')

module.exports = _.curry(function(config, next) {
    config = _.defaultsDeep(config, emptyConfig)
    _.each(config.vhosts, function(vhost, name) {
        configureVhost(config, name, vhost)
        configureConnection(config.vhosts[name], name)
        configureExchanges(config.vhosts[name])
        configureQueues(config.vhosts[name])
        configureBindings(config.vhosts[name])
    })
    configurePublications(config)
    configureSubscriptions(config)
    next(null, config)
})

function configureVhost(config, name, vhost) {
    debug(format('Configuring vhost: %s', name))
    config.vhosts[name] = _.defaultsDeep(vhost, { name: name, namespace: config.defaults.vhosts.namespace }, { defaults: config.defaults.vhosts })
    config.vhosts[name].namespace = config.vhosts[name].namespace === true ? uuid() : config.vhosts[name].namespace
}

function configureConnection(config, name) {
    config.connection = _.defaultsDeep(config.connection || {}, config.defaults.connection)
    config.connection.vhost = config.connection.vhost !== undefined ? config.connection.vhost : name,
    config.connection.auth = config.connection.user + ':' + config.connection.password
    config.connection.pathname = config.connection.vhost === '/' ? '' : config.connection.vhost
    config.connection.query = config.connection.options
    config.connection.url = config.connection.url || url.format(config.connection)
    config.connection.loggableUrl = config.connection.url.replace(/:[^:]*?@/, ':***@')
}

function configurePublications(config) {
    _.each(config.publications, function(publicationConfig, name) {
        debug(format('Configuring publication: %s', name))
        config.publications[name] = _.defaultsDeep(publicationConfig, { name: name }, config.defaults.publications)
        var namespace = config.vhosts[publicationConfig.vhost].namespace
        var destination = prefix(namespace, publicationConfig.exchange || publicationConfig.queue)
        config.publications[name].destination = destination
    })
}

function configureSubscriptions(config) {
    _.each(config.subscriptions, function(subscriptionConfig, name) {
        debug(format('Configuring subscription: %s', name))
        config.subscriptions[name] = _.defaultsDeep(subscriptionConfig, { name: name }, config.defaults.subscriptions)
        var namespace = config.vhosts[subscriptionConfig.vhost].namespace
        var source = prefix(namespace, subscriptionConfig.queue)
        config.subscriptions[name].source = source
    })
}

var configureExchanges = _.curry(configureObjects)('exchanges')
var configureQueues = _.curry(configureObjects)('queues')
var configureBindings = _.curry(configureObjects)('bindings')

function configureObjects(type, config) {
    config[type] = config[type] || {}
    _.each(config[type], function(objectConfig, name) {
        debug(format('Configuring %s: %s', type, name))
        config[type][name] = _.defaultsDeep(objectConfig, { name: name }, config.defaults[type])
        var fullyQualifiedName = prefix(config.namespace, name)
        config[type][name].fullyQualifiedName = qualify(name, config.namespace, objectConfig.unique)
    })
}

function qualify(name, namespace, unique) {
    name = prefix(namespace, name)
    name = suffix(unique ? uuid() : undefined, name)
    return name
}

function prefix(value, name) {
    return value ? value + ':' + name : name
}

function suffix(value, name) {
    return value ? name + ':' + value : name
}
