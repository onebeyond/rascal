var _ = require('lodash');
var defaultConfig = require('./lib/config/defaults');
var testConfig = require('./lib/config/tests');
var Broker = require('./lib/amqp/Broker');
var BrokerAsPromised = require('./lib/amqp/BrokerAsPromised');

module.exports = (function() {
  return {
    Broker: Broker,
    BrokerAsPromised: BrokerAsPromised,
    createBroker: Broker.create,
    createBrokerAsPromised: BrokerAsPromised.create,
    defaultConfig: defaultConfig,
    testConfig: testConfig,
    withDefaultConfig: function(config) {
      return _.defaultsDeep({}, config, defaultConfig);
    },
    withTestConfig: function(config) {
      return _.defaultsDeep({}, config, testConfig);
    },
    counters: require('./lib/counters'),
  };
})();
