const _ = require('lodash');
const defaultConfig = require('./lib/config/defaults');
const testConfig = require('./lib/config/tests');
const Broker = require('./lib/amqp/Broker');
const BrokerAsPromised = require('./lib/amqp/BrokerAsPromised');

module.exports = (function () {
  return {
    Broker,
    BrokerAsPromised,
    createBroker: Broker.create,
    createBrokerAsPromised: BrokerAsPromised.create,
    defaultConfig,
    testConfig,
    withDefaultConfig(config) {
      return _.defaultsDeep({}, config, defaultConfig);
    },
    withTestConfig(config) {
      return _.defaultsDeep({}, config, testConfig);
    },
    counters: require('./lib/counters'),
  };
})();
