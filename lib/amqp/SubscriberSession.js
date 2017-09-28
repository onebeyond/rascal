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
        channel.once('close', unref.bind(null, _channel))
        channel.once('error', unref.bind(null, _channel))
    }

    this.close = this.cancel = function(next) {
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
        if (!options) return self._nack(message, {})
        debug('Not acknowledging message: %s with requeue: %s', message.properties.messageId, !!options.requeue)
        channel.nack(message, false, !!options.requeue)
    }

    function unref(_channel, me) {
        if (channel === _channel) channel = undefined
    }
}
