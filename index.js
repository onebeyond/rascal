'use strict'

var defaults = require('./lib/config/defaults')
var Broker = require('./lib/amqp/Broker')

module.exports = (function() {
    return {
        Broker: Broker,
        defaults: defaults
    }
})()