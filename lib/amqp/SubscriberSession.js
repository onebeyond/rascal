var debug = require('debug')('rascal:SubscriberSession')
var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits

module.exports = SubscriberSession

inherits(SubscriberSession, EventEmitter)

function SubscriberSession() {

    var channel
    var consumerTag
    var self = this

    this.open = function(_channel, _consumerTag) {
        channel = _channel
        consumerTag = _consumerTag
    }

    this.close = this.cancel =  function(next) {
        if (!channel) return next()
        channel.cancel(consumerTag, function(err) {
            if (err) return next(err)
            channel.close(next)
            channel = undefined
        })
    }

    this._ack = function(message) {
        debug('Acknowledging message', message.properties.messageId)
        channel.ack(message)
    }

    this._nack = function(message, options) {
        debug('Not acknowledging message: %s with options:', message.properties.messageId, options)
        channel.nack(message, false, !!options.requeue)
    }
}