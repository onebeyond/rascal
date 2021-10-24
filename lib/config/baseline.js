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
          rejectionDelayMillis: 1000,
          testOnBorrow: true,
          acquireTimeoutMillis: 15000,
          destroyTimeoutMillis: 1000,
        },
        confirmPool: {
          autostart: false,
          max: 5,
          min: 1,
          evictionRunIntervalMillis: 10000,
          idleTimeoutMillis: 60000,
          rejectionDelayMillis: 1000,
          testOnBorrow: true,
          acquireTimeoutMillis: 15000,
          destroyTimeoutMillis: 1000,
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
        options: {},
        retry: {
          min: 1000,
          max: 60000,
          factor: 2,
          strategy: 'exponential',
        },
        management: {
          slashes: true,
          protocol: 'http',
          port: 15672,
          options: {},
        },
      },
      exchanges: {
        assert: true,
        type: 'topic',
        options: {},
      },
      queues: {
        assert: true,
        options: {
          arguments: {},
        },
      },
      bindings: {
        destinationType: 'queue',
        bindingKey: '#',
        options: {},
      },
    },
    publications: {
      vhost: '/',
      confirm: true,
      timeout: 10000,
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
      options: {},
    },
    redeliveries: {
      counters: {
        stub: {},
        inMemory: {
          size: 1000,
        },
      },
    },
    shovels: {},
  },
  publications: {},
  subscriptions: {},
  redeliveries: {
    counters: {
      stub: {},
    },
  },
};
