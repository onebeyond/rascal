const _ = require('lodash').runInContext();
const defaultConfig = require('./defaults');

module.exports = _.defaultsDeep(
  {
    defaults: {
      vhosts: {
        connection: {
          options: {
            heartbeat: 50,
          },
        },
        namespace: true,
        exchanges: {
          options: {
            durable: false,
          },
        },
        queues: {
          purge: true,
          options: {
            durable: false,
          },
        },
      },
      publications: {
        options: {
          persistent: false,
        },
      },
      subscriptions: {
        deferCloseChannel: 100,
      },
    },
    redeliveries: {
      counters: {
        inMemory: {
          size: 1000,
        },
      },
    },
  },
  defaultConfig
);
