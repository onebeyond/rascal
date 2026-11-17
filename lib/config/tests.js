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
            // RabbitMQ 4.3+ rejects non-durable, non-exclusive queues by default.
            // Expire queues left behind by aborted test runs after 10 minutes unused.
            durable: true,
            arguments: {
              'x-expires': 600000,
            },
          },
        },
      },
      publications: {
        options: {
          persistent: false,
        },
      },
      subscriptions: {
        closeTimeout: 500,
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
  defaultConfig,
);
