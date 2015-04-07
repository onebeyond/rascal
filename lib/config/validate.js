'use strict'

var debug = require('debug')('rascal:config:validate')
var format = require('util').format
var _ = require('lodash')
var async = require('async')

module.exports = _.curry(function(config, next) {

    try {
        validateVhosts(config.vhosts)
        validatePublications(config.publications)
        validateSubscriptions(config.subscriptions)
        next(null, config)
    } catch (err) {
        next(err, config)
    }

    function validateVhosts(vhosts) {
        _.each(vhosts, validateVhost)
    }

    function validateVhost(vhost, vhostName) {
        validateAttributes('Vhost', vhost, vhostName, ['defaults', 'namespace', 'name', 'connection', 'exchanges', 'queues', 'bindings'])
        validateConnectionAttributes(vhost.connection, vhostName, ['slashes', 'protocol', 'hostname', 'user', 'password', 'port', 'vhost', 'options', 'retry', 'auth', 'pathname', 'query', 'url', 'loggableUrl'])
        validateExchanges(vhost, vhostName, vhost.exchanges)
        validateQueues(vhost, vhostName, vhost.queues)
        validateBindings(vhost, vhostName, vhost.bindings)
    }

    function validateAttributes(type, object, objectName, valid) {
        var invalid = _.chain(object).omit(valid).keys().value()
        if (invalid.length) throw new Error(format('%s: %s refers to an unsupported attribute: %s', type, objectName, invalid[0]))
    }

    function validateConnectionAttributes(connection, vhostName, valid) {
        var invalid = _.chain(connection).omit(valid).keys().value()
        if (invalid.length) throw new Error(format('Vhost: %s connection refers to an unsupported attribute: %s', vhostName, invalid[0]))
    }

    function validateVhostChildAttributes(vhostName, type, child, childName, valid) {
        var invalid = _.chain(child).omit(valid).keys().value()
        if (invalid.length) throw new Error(format('%s: %s in vhost: %s refers to an unsupported attribute: %s', type, childName, vhostName, invalid[0]))
    }

    function validateExchanges(vhost, vhostName, exchanges) {
        _.each(exchanges, validateExchange.bind(null, vhost, vhostName))
    }

    function validateExchange(vhost, vhostName, exchange, exchangeName) {
        validateVhostChildAttributes(vhostName, 'Exchange', exchange, exchangeName, ['fullyQualifiedName', 'name', 'assert', 'check', 'type', 'options'])
    }

    function validateQueues(vhost, vhostName, queues) {
        _.each(queues, validateQueue.bind(null, vhost, vhostName))
    }

    function validateQueue(vhost, vhostName, queue, queueName) {
        validateVhostChildAttributes(vhostName, 'Queue', queue, queueName, ['fullyQualifiedName', 'name', 'assert', 'check', 'type', 'purge', 'replyTo', 'options'])
    }

    function validateBindings(vhost, vhostName, bindings) {
        _.each(bindings, validateBinding.bind(null, vhost, vhostName))
    }

    function validateBinding(vhost, vhostName, binding, bindingName) {
        validateVhostChildAttributes(vhostName, 'Binding', binding, bindingName, ['fullyQualifiedName', 'name', 'source', 'destination', 'destinationType', 'bindingKey', 'options'])
        if (!binding.source) throw new Error(format('Binding: %s in vhost: %s is missing a source', bindingName, vhostName))
        if (!binding.destination) throw new Error(format('Binding: %s in vhost: %s is missing a destination', bindingName, vhostName))
        if (!binding.destinationType) throw new Error(format('Binding: %s in vhost: %s is missing a destination type', bindingName, vhostName))
        if (['queue', 'exchange'].indexOf(binding.destinationType) < 0) throw new Error(format('Binding: %s in vhost: %s has an invalid destination type: %s', bindingName, vhostName, binding.destinationType))

        if (!vhost.exchanges) throw new Error(format('Binding: %s in vhost: %s refers to an unknown exchange: %s', bindingName, vhostName, binding.source))
        if (!vhost.exchanges[binding.source]) throw new Error(format('Binding: %s in vhost: %s refers to an unknown exchange: %s', bindingName, vhostName, binding.source))

        if (binding.destinationType === 'queue') {
            if (!vhost.queues) throw new Error(format('Binding: %s in vhost: %s refers to an unknown queue: %s', bindingName, vhostName, binding.destination))
            if (!vhost.queues[binding.destination]) throw new Error(format('Binding: %s in vhost: %s refers to an unknown queue: %s', bindingName, vhostName, binding.destination))
        } else {
            if (!vhost.exchanges[binding.destination]) throw new Error(format('Binding: %s in vhost: %s refers to an unknown exchange: %s', bindingName, vhostName, binding.destination))
        }
    }

    function validatePublications(publications) {
        _.each(publications, validatePublication)
    }

    function validatePublication(publication, publicationName) {
        validateAttributes('Publication', publication, publicationName, ['name', 'vhost', 'exchange', 'queue', 'routingKey', 'confirm', 'options', 'destination'])
        if (!publication.vhost) throw new Error(format('Publication: %s is missing a vhost', publicationName))
        if (!(publication.exchange || publication.queue)) throw new Error(format('Publication: %s is missing an exchange or a queue', publicationName))
        if ((publication.exchange && publication.queue)) throw new Error(format('Publication: %s has an exchange and a queue', publicationName))

        if (!config.vhosts) throw new Error(format('Publication: %s refers to an unknown vhost: %s', publicationName, publication.vhost))
        if (!config.vhosts[publication.vhost]) throw new Error(format('Publication: %s refers to an unknown vhost: %s', publicationName, publication.vhost))

        if (publication.exchange) {
            if (!config.vhosts[publication.vhost].exchanges) throw new Error(format('Publication: %s refers to an unknown exchange: %s in vhost: %s', publicationName, publication.exchange, publication.vhost))
            if (!config.vhosts[publication.vhost].exchanges[publication.exchange]) throw new Error(format('Publication: %s refers to an unknown exchange: %s in vhost: %s', publicationName, publication.exchange, publication.vhost))
        } else {
            if (!config.vhosts[publication.vhost].queues) throw new Error(format('Publication: %s refers to an unknown queue: %s in vhost: %s', publicationName, publication.queue, publication.vhost))
            if (!config.vhosts[publication.vhost].queues[publication.queue]) throw new Error(format('Publication: %s refers to an unknown queue: %s in vhost: %s', publicationName, publication.queue, publication.vhost))
        }
    }

    function validateSubscriptions(subscriptions) {
        _.each(subscriptions, validateSubscription)
    }

    function validateSubscription(subscription, subscriptionName) {
        validateAttributes('Subscription', subscription, subscriptionName, ['name', 'vhost', 'queue', 'contentType', 'options', 'prefetch', 'retry', 'source'])

        if (!subscription.vhost) throw new Error(format('Subscription: %s is missing a vhost', subscriptionName))
        if (!subscription.queue) throw new Error(format('Subscription: %s is missing a queue', subscriptionName))

        if (!config.vhosts) throw new Error(format('Subscription: %s refers to an unknown vhost: %s', subscriptionName, subscription.vhost))
        if (!config.vhosts[subscription.vhost]) throw new Error(format('Subscription: %s refers to an unknown vhost: %s', subscriptionName, subscription.vhost))

        if (!config.vhosts[subscription.vhost].queues) throw new Error(format('Subscription: %s refers to an unknown queue: %s in vhost: %s', subscriptionName, subscription.queue, subscription.vhost))
        if (!config.vhosts[subscription.vhost].queues[subscription.queue]) throw new Error(format('Subscription: %s refers to an unknown queue: %s in vhost: %s', subscriptionName, subscription.queue, subscription.vhost))
    }
})

