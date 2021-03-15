const _ = require('lodash');
const defaultConfig = require('./lib/config/defaults');
const testConfig = require('./lib/config/tests');
const Broker = require('./lib/amqp/Broker');
const BrokerAsPromised = require('./lib/amqp/BrokerAsPromised');

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
