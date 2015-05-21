'use strict'

var debug = require('debug')('rascal:config:configure')
var format = require('util').format
var url = require('url')
var _ = require('lodash').runInContext().mixin({ 'defaultsDeep': require('merge-defaults') })
var uuid = require('node-uuid').v4
var emptyConfig = require('./empty')
var fqn = require('./fqn')
var XRegExp = require('xregexp').XRegExp

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
        var destination = publicationConfig.exchange ? getExchange(publicationConfig.vhost, publicationConfig.exchange)
                                                     : getQueue(publicationConfig.vhost, publicationConfig.queue)
        config.publications[name].destination = destination.fullyQualifiedName
    })

    function getExchange(vhost, name) {
        return config.vhosts[vhost].exchanges[name]
    }

    function getQueue(vhost, name) {
        return config.vhosts[vhost].queues[name]
    }
}

function configureSubscriptions(config) {
    _.each(config.subscriptions, function(subscriptionConfig, name) {
        debug(format('Configuring subscription: %s', name))
        config.subscriptions[name] = _.defaultsDeep(subscriptionConfig, { name: name }, config.defaults.subscriptions)
        subscriptionConfig.source = config.vhosts[subscriptionConfig.vhost].queues[subscriptionConfig.queue].fullyQualifiedName
    })
}

function configureExchanges(config) {
    config.exchanges = ensureKeyedCollection(config.exchanges)
    _.each(config.exchanges, function(exchangeConfig, name) {
        debug(format('Configuring exchange: %s', name))
        config.exchanges[name] = _.defaultsDeep(exchangeConfig, { name: name, fullyQualifiedName: fqn.qualify(name, config.namespace) }, config.defaults.exchanges)
    })
}

function configureQueues(config) {
    config.queues = ensureKeyedCollection(config.queues)
    _.each(config.queues, function(queueConfig, name) {
        debug(format('Configuring queue: %s', name))
        queueConfig.replyTo = queueConfig.replyTo === true ? uuid() : queueConfig.replyTo
        qualifyArguments(config.namespace, queueConfig.options && queueConfig.options.arguments)
        config.queues[name] = _.defaultsDeep(queueConfig, { name: name, fullyQualifiedName: fqn.qualify(name, config.namespace, queueConfig.replyTo) }, config.defaults.queues)
    })
}

function configureBindings(config) {

    config.bindings = expandBindings(ensureKeyedCollection(config.bindings))

    _.each(config.bindings, function(bindingConfig, name) {
        debug(format('Configuring binding: %s', name))

        config.bindings[name] = _.defaultsDeep(bindingConfig, config.defaults.bindings)

        if (bindingConfig.qualifyBindingKeys) {
            config.bindings[name].bindingKey = fqn.qualify(bindingConfig.bindingKey, config.namespace)
        }
        if (bindingConfig.destinationType === 'queue') {
            var queue = config.queues[bindingConfig.destination]
            config.bindings[name].bindingKey = fqn.prefix(queue && queue.replyTo, bindingConfig.bindingKey, '.')
        }
    })
}

function parseBindingName(name) {
    var pattern = XRegExp('(?<source>[\\w:]+)\\s*(?:\\[\\s*(?<keys>.*)\\s*\\])?\\s*->\\s*(?<destination>[\\w:]+)')
    var match = XRegExp.exec(name, pattern)
    return match ? { name: name, source: match.source, destination: match.destination, bindingKeys: splitBindingKeys(match.keys) } : { name: name }
}

function splitBindingKeys(keys) {
    return keys ? _.compact(keys.split(/[,\s]+/)) : undefined
}

function expandBindings(definitions) {
    var result = {}
    _.each(definitions, function(bindingConfig, name) {
        var parsedConfig = parseBindingName(name)
        var bindingKeys = _.chain([]).concat(bindingConfig.bindingKeys, bindingConfig.bindingKey, parsedConfig.bindingKeys).compact().unique().value()
        if (bindingKeys.length <= 1) return result[name] = _({ bindingKey: bindingKeys[0] }).defaults(bindingConfig, parsedConfig).omit('bindingKeys').value()
        _.each(bindingKeys, function(bindingKey) {
            result[format('%s:%s', name, bindingKey)] = _({ bindingKey: bindingKey }).defaults(bindingConfig, parsedConfig).omit('bindingKeys').value()
        })
    })
    return result
}

function qualifyArguments(namespace, args) {
    if (!args) return
    _.each(['x-dead-letter-exchange'], function(name) {
        args[name] = args[name] !== undefined ? fqn.qualify(args[name], namespace) : args[name]
    })
}

function ensureKeyedCollection(collection) {
    if (!_.isArray(collection)) return collection
    return _.chain(collection).map(function(item) {
        return _.isString(item) ? { name: item } : _.defaults(item, { name: 'unnamed-' + uuid() })
    }).indexBy('name').value()
}
