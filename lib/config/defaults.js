module.exports = {
  defaults: {
    vhosts: {
      connection: {
        options: {
          heartbeat: 10,
          connection_timeout: 10000,
          channelMax: 100,
        },
        socketOptions: {
          timeout: 10000,
        },
        management: {
          options: {
            timeout: 1000,
          },
        },
      },
    },
  },
};
