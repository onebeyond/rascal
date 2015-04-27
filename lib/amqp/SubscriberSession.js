var debug = require('debug')('rascal:SubscriberSession')
var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits

module.exports = SubscriberSession

inherits(SubscriberSession, EventEmitter)

function SubscriberSession() {

    var channel
    var consumerTag

    this.open = function(_channel, _consumerTag) {
        channel = _channel
        consumerTag = _consumerTag
    }

    this.close =  function(next) {
        if (!channel) return next()
        channel.cancel(consumerTag, function(err) {
            if (err) return next(err)
            channel.close(next)
            channel = undefined
        })
    }

    this.cancel = this.close
}