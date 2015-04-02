'use strict'

var _ = require('lodash').runInContext().mixin({ 'defaultsDeep': require('merge-defaults') })
var defaultConfig = require('./lib/config/defaults')
var testConfig = require('./lib/config/tests')
var Broker = require('./lib/amqp/Broker')

module.exports = (function() {
    return {
        Broker: Broker,
        createBroker: Broker.create,
        defaultConfig: defaultConfig,
        testConfig: testConfig,
        withDefaultConfig: function(config) {
            return _.defaultsDeep(config, defaultConfig)
        },
        withTestConfig: function(config) {
            return _.defaultsDeep(config, testConfig)
        }
    }
})()