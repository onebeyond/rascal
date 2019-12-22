module.exports = {
  defaults: {
    vhosts: {
      publicationChannelPools: {
        regularPool: {
          autostart: false,
          max: 5,
          min: 1,
          evictionRunIntervalMillis: 10000,
          idleTimeoutMillis: 60000,
          testOnBorrow: true,
        },
        confirmPool: {
          autostart: false,
          max: 5,
          min: 1,
          evictionRunIntervalMillis: 10000,
          idleTimeoutMillis: 60000,
          testOnBorrow: true,
        },
      },
      connectionStrategy: 'random',
      connection: {
        slashes: true,
        protocol: 'amqp',
        hostname: 'localhost',
        user: 'guest',
        password: 'guest',
        port: '5672',
        options: {
          heartbeat: 10,
          connection_timeout: 10000,
          channelMax: 100,
        },
        retry: {
          min: 1000,
          max: 60000,
          factor: 2,
          strategy: 'exponential',
        },
        socketOptions: {
          timeout: 10000,
        },
        management: {
          slashes: true,
          protocol: "http",
          port: 15672,
          options: {
            timeout: 1000,
          },
        },
      },
      exchanges: {
        assert: true,
        type: 'topic',
      },
      queues: {
        assert: true,
      },
      bindings: {
        destinationType: 'queue',
        bindingKey: '#',
      },
    },
    publications: {
      vhost: '/',
      confirm: true,
      options: {
        persistent: true,
        mandatory: true,
      },
    },
    subscriptions: {
      vhost: '/',
      prefetch: 10,
      retry: {
        min: 1000,
        max: 60000,
        factor: 2,
        strategy: 'exponential',
      },
      redeliveries: {
        limit: 100,
        timeout: 1000,
        counter: 'stub',
      },
      deferCloseChannel: 10000,
    },
    redeliveries: {
      counters: {
        stub: {},
        inMemory: {
          size: 1000,
        },
      },
    },
  },
};
