'use strict'

var debug = require('debug')('rascal:config:configure')
var format = require('util').format
var url = require('url')
var _ = require('lodash').runInContext().mixin({ 'defaultsDeep': require('merge-defaults') })
var uuid = require('uuid').v4
var emptyConfig = require('./empty')
var fqn = require('./fqn')
var XRegExp = require('xregexp')
var freeze = require('deep-freeze')

module.exports = _.curry(function(rascalConfig, next) {

    rascalConfig = _.defaultsDeep(rascalConfig, emptyConfig, { publications: {}, subscriptions: {}, redeliveries: { counters: { stub: {} }}})
    var err
    var connectionIndexes = {}

    try {
        configureVhosts(rascalConfig.vhosts)
        configurePublications(rascalConfig.publications, rascalConfig.vhosts)
        configureSubscriptions(rascalConfig.subscriptions, rascalConfig.vhosts)
        configureShovels(rascalConfig.shovels)
        configureCounters(rascalConfig.redeliveries.counters)
    } catch(_err) {
        err = _err
    }

    return err ? next(err) :next(null, freeze(rascalConfig))

    function configureVhosts(vhosts) {
        _.each(rascalConfig.vhosts, function(vhostConfig, name) {
            configureVhost(name, vhostConfig)
            configureExchanges(vhostConfig)
            configureQueues(vhostConfig)
            configureBindings(vhostConfig)
            configureVhostPublications(vhostConfig)
            configureVhostSubscriptions(vhostConfig)
        })
    }

    function configureVhost(name, vhostConfig) {
        debug('Configuring vhost: %s', name)
        rascalConfig.vhosts[name] = _.defaultsDeep(vhostConfig, {
            name: name,
            namespace: rascalConfig.defaults.vhosts.namespace,
            publicationChannelPools: rascalConfig.defaults.vhosts.publicationChannelPools
        }, { defaults: rascalConfig.defaults.vhosts })
        rascalConfig.vhosts[name].namespace = vhostConfig.namespace === true ? uuid() : vhostConfig.namespace
        configureConnections(vhostConfig, name)
    }

    function configureConnections(vhostConfig, vhostName) {
        vhostConfig.connections = _.chain([]).concat(vhostConfig.connections, vhostConfig.connection).compact().uniq().map(function(connection) {
            return _.isString(connection) ? { url: connection } : connection
        }).value()
        if (vhostConfig.connections.length === 0) vhostConfig.connections.push({})
        _.each(vhostConfig.connections, function(connection) {
            configureConnection(vhostConfig, vhostName, connection)
        })
        vhostConfig.connections = _.sortBy(vhostConfig.connections, 'index')
        delete vhostConfig.connection
    }

    function configureConnection(vhostConfig, vhostName, connection) {
        _.defaultsDeep(connection, vhostConfig.defaults.connection)
        connection.vhost = connection.vhost !== undefined ? connection.vhost : vhostName,
        connection.auth = connection.user + ':' + connection.password
        connection.pathname = connection.vhost === '/' ? '' : connection.vhost
        connection.query = connection.options
        connection.url = connection.url || url.format(connection)
        connection.loggableUrl = connection.url.replace(/:[^:]*?@/, ':***@')
        connection.index = getConnectionIndex(connection.url)
    }

    function getConnectionIndex(connectionString) {
        var host = url.parse(connectionString).host
        if (_.has(connectionIndexes, host)) return connectionIndexes[host]
        connectionIndexes[host] = Math.random()
        return connectionIndexes[host]
    }

    function configureVhostPublications(vhostConfig) {
        _.each(vhostConfig.publications, function(publicationConfig, name) {
            publicationConfig.vhost = vhostConfig.name
            configurePublication(publicationConfig, name)
        })
        delete vhostConfig.publications
    }

    function configurePublications(publications, vhosts) {
        var defaultPublications = _.reduce(vhosts, function(publications, vhost) {
            _.each(vhost.exchanges, function(exchange) {
                var name = vhost.name === '/' ? format('/%s', exchange.name) : format('%s/%s', vhost.name, exchange.name)
                publications[name] = { exchange: exchange.name, vhost: vhost.name, autoCreated: true }
                publications[exchange.name] = { exchange: exchange.name, vhost: vhost.name, autoCreated: true, deprecated: true }
            })
            _.each(vhost.queues, function(queue) {
                var name = vhost.name === '/' ? format('/%s', queue.name) : format('%s/%s', vhost.name, queue.name)
                publications[name] = { queue: queue.name, vhost: vhost.name, autoCreated: true }
                publications[queue.name] = { queue: queue.name, vhost: vhost.name, autoCreated: true, deprecated: true }
            })
            return publications
        }, {})

        _.each(_.defaults({}, publications, defaultPublications), configurePublication)
    }

    function configurePublication(publicationConfig, name) {
        debug('Configuring publication: %s', name)
        if (rascalConfig.publications[name] && rascalConfig.publications[name].vhost !== publicationConfig.vhost) throw new Error(format('Duplicate publication: %s', name))
        rascalConfig.publications[name] = _.defaultsDeep(publicationConfig, { name: name }, rascalConfig.defaults.publications)
        if (!rascalConfig.vhosts[publicationConfig.vhost]) return
        var destination = publicationConfig.exchange ? rascalConfig.vhosts[publicationConfig.vhost].exchanges[publicationConfig.exchange]
                                                     : rascalConfig.vhosts[publicationConfig.vhost].queues[publicationConfig.queue]
        rascalConfig.publications[name].destination = destination.fullyQualifiedName
    }

    function configureVhostSubscriptions(vhostConfig) {
        _.each(vhostConfig.subscriptions, function(subscriptionConfig, name) {
            subscriptionConfig.vhost = vhostConfig.name
            configureSubscription(subscriptionConfig, name)
        })
        delete vhostConfig.subscriptions
    }

    function configureSubscriptions(subscriptions, vhosts) {
        var defaultSubscriptions = _.reduce(vhosts, function(subscriptions, vhost) {
            _.each(vhost.queues, function(queue) {
                var name = vhost.name === '/' ? format('/%s', queue.name) : format('%s/%s', vhost.name, queue.name)
                subscriptions[name] = { queue: queue.name, vhost: vhost.name, autoCreated: true }
                subscriptions[queue.name] = { queue: queue.name, vhost: vhost.name, autoCreated: true, deprecated: true }
            })
            return subscriptions
        }, {})
        _.each(_.defaults({}, subscriptions, defaultSubscriptions), configureSubscription)
    }

    function configureSubscription(subscriptionConfig, name) {
        debug('Configuring subscription: %s', name)
        if (rascalConfig.subscriptions[name] && rascalConfig.subscriptions[name].vhost !== subscriptionConfig.vhost) throw new Error(format('Duplicate subscription: %s', name))
        rascalConfig.subscriptions[name] = _.defaultsDeep(subscriptionConfig, { name: name }, rascalConfig.defaults.subscriptions)
        if (!rascalConfig.vhosts[subscriptionConfig.vhost]) return
        subscriptionConfig.source = rascalConfig.vhosts[subscriptionConfig.vhost].queues[subscriptionConfig.queue].fullyQualifiedName
    }

    function configureShovels(shovels) {
        rascalConfig.shovels = ensureKeyedCollection(shovels)
        _.each(rascalConfig.shovels, configureShovel)
    }

    function configureShovel(shovelConfig, name) {
        debug('Configuring shovel: %s', name)
        var parsedConfig = parseShovelName(name)
        rascalConfig.shovels[name] = _.defaultsDeep(shovelConfig, { name: name }, parsedConfig, rascalConfig.defaults.shovels)
    }

    function parseShovelName(name) {
        var pattern = XRegExp('(?<subscription>[\\w:]+)\\s*->\\s*(?<publication>[\\w:]+)')
        var match = XRegExp.exec(name, pattern)
        return match ? { name: name, subscription: match.subscription, publication: match.publication } : { name: name }
    }

    function configureCounters(counters) {
        rascalConfig.counters = ensureKeyedCollection(counters)
        _.each(rascalConfig.counters, configureCounter)
    }

    function configureCounter(counterConfig, name) {
        debug('Configuring counter: %s', name)
        rascalConfig.counters[name] = _.defaultsDeep(counterConfig, { name: name, type: name }, rascalConfig.defaults.counters)
    }

    function configureExchanges(config) {
        config.exchanges = ensureKeyedCollection(config.exchanges)
        _.each(config.exchanges, function(exchangeConfig, name) {
            debug('Configuring exchange: %s', name)
            config.exchanges[name] = _.defaultsDeep(exchangeConfig, { name: name, fullyQualifiedName: fqn.qualify(name, config.namespace) }, config.defaults.exchanges)
        })
    }

    function configureQueues(config) {
        config.queues = ensureKeyedCollection(config.queues)
        _.each(config.queues, function(queueConfig, name) {
            debug('Configuring queue: %s', name)
            queueConfig.replyTo = queueConfig.replyTo === true ? uuid() : queueConfig.replyTo
            qualifyArguments(config.namespace, queueConfig.options && queueConfig.options.arguments)
            config.queues[name] = _.defaultsDeep(queueConfig, { name: name, fullyQualifiedName: fqn.qualify(name, config.namespace, queueConfig.replyTo) }, config.defaults.queues)
        })
    }

    function configureBindings(config) {

        config.bindings = expandBindings(ensureKeyedCollection(config.bindings))

        _.each(config.bindings, function(bindingConfig, name) {
            debug('Configuring binding: %s', name)

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
        var pattern = XRegExp('(?<source>[\\w:\\.\\-]+)\\s*(?:\\[\\s*(?<keys>.*)\\s*\\])?\\s*->\\s*(?<destination>[\\w:\\.\\-]+)')
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
            var bindingKeys = _.chain([]).concat(bindingConfig.bindingKeys, bindingConfig.bindingKey, parsedConfig.bindingKeys).compact().uniq().value()
            if (bindingKeys.length <= 1) {
                result[name] = _({ bindingKey: bindingKeys[0] }).defaults(bindingConfig, parsedConfig).omit('bindingKeys').value()
                return result[name]
            }
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
        }).keyBy('name').value()
    }
})
