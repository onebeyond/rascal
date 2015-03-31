'use strict'

var Broker = require('./lib/ampq/Broker')
var defaults = require('./lib/config/defaults')

module.exports = (function() {
    return {
        Broker: Broker,
        defaults: defaults
    }
})()