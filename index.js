'use strict'

var debug = require('debug')('amqp-nice')
var _ = require('lodash').runInContext()
var Broker = require('./lib/model/Broker')
var defaultConfig = require('./lib/config/defaults')

_.mixin({ 'defaultsDeep': require('merge-defaults') });

module.exports = (function() {

    function init(overrides, next) {
        if (arguments.length === 1) return init({}, arguments[0])
        new Broker(_.defaultsDeep(overrides, defaultConfig)).init(next)
    }

    return {
        init: init
    }
})()