var debug = require('debug')('amqp-nice:Broker')

var format = require('util').format
var _ = require('lodash')
var async = require('async')

_.mixin({ 'defaultsDeep': require('merge-defaults') });


module.exports = {
    create: function(vhost, config, next) {
        new Publication(vhost, config).init(next)
    }
}

function Publication(vhost, config) {

    var self = this

    this.init = function(next) {
        return next(null, self)
    }

    this.publish = function(message, overrides, next) {
        var publishConfig = _.defaultsDeep(overrides, config)
        var content = getContent(message)
        debug(format('Publishing %d bytes to exchange: %s with routingKey: %s', content.length, config.exchange, config.routingKey))
        vhost.getChannel(function(err, channel) {
            if (err) return next(err)
            channel.publish(config.exchange, config.routingKey, content, config.options)
            channel.close()
        })
    }

    function getContent(message) {
        return Buffer.isBuffer(message) ? message
                                        : _.isString(message) ? new Buffer(message)
                                                              : new Buffer(JSON.stringify(message))
    }
}

