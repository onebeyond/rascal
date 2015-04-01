'use strict'

var debug = require('debug')('amqp-nice:config:configure')
var format = require('util').format
var url = require('url')
var _ = require('lodash').runInContext()
var uuid = require('node-uuid').v4
var emptyConfig = require('./empty')

_.mixin({ 'defaultsDeep': require('merge-defaults') });

module.exports = _.curry(function(config, next) {
    config = _.defaultsDeep(config, emptyConfig)
    _.each(config.vhosts, function(vhost, name) {
        configureVhost(config, name, vhost)
        configureConnection(config.vhosts[name])
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

function configureConnection(config) {
    config.connection = _.defaultsDeep(config.connection || {}, config.defaults.connection)
    config.connection.auth = config.connection.user + ':' + config.connection.password
    config.connection.pathname = config.connection.vhost
    config.connection.query = config.connection.options
    config.connection.url = config.connection.url || url.format(config.connection)
    config.connection.loggableUrl = config.connection.url.replace(/:[^:]*?@/, ':***@')
}

function configurePublications(config) {
    _.each(config.publications, function(options, name) {
        debug(format('Configuring publication: %s', name))
        var namespace = config.vhosts[options.vhost].namespace
        var destination = prefix(namespace, options.exchange || options.queue)
        config.publications[name] = _.defaultsDeep(options, { name: name, destination: destination }, config.defaults.publications)
    })
}

function configureSubscriptions(config) {
    _.each(config.subscriptions, function(options, name) {
        debug(format('Configuring subscription: %s', name))
        var namespace = config.vhosts[options.vhost].namespace
        var source = prefix(namespace, options.queue)
        config.subscriptions[name] = _.defaultsDeep(options, { name: name, source: source }, config.defaults.subscriptions)
    })
}

var configureExchanges = _.curry(configureObjects)('exchanges')
var configureQueues = _.curry(configureObjects)('queues')
var configureBindings = _.curry(configureObjects)('bindings')

function configureObjects(type, config) {
    config[type] = config[type] || {}
    _.each(config[type], function(options, name) {
        debug(format('Configuring %s: %s', type, name))
        config[type][name] = _.defaultsDeep(options, { name: name }, config.defaults[type])
        config[type][name].fullyQualifiedName = prefix(config.namespace, name)
    })
}

function prefix(namespace, name) {
    return namespace ? namespace + ':' + name : name
}
