module.exports = {
  rascal: {
    vhosts: {
      // Define the name of the vhost
      'customer-vhost': {
        // Creates the vhost if it doesn't exist (requires the RabbitMQ management plugin to be installed)
        assert: true,

        // Define the vhost connection parameters. Specify multiple entries for clusters.
        // Rascal will randomise the list, and cycle through the entries until it finds one that works
        connections: [
          {
            url: 'amqp://does-not-exist-1b9935d9-5066-4b13-84dc-a8e2bb618154:5672/customer-vhost',
          },
          {
            user: 'guest',
            password: 'guest',
            port: 5672,
            options: {
              heartbeat: 1,
            },
            socketOptions: {
              timeout: 1000,
            },
          },
        ],

        // Define exchanges within the registration vhost
        exchanges: [
          'service', // Shared exchange for all services within this vhost
          'delay', // To delay failed messages before a retry
          'retry', // To retry failed messages up to maximum number of times
          'dead_letters', // When retrying fails, messages end up here
        ],

        // Define queues within the registration vhost
        // A good naming convention for queues is consumer:entity:action
        queues: {
          // Create a queue for saving users
          'registration_service:user:save': {
            options: {
              arguments: {
                // Route nacked messages to a service specific dead letter queue
                'x-dead-letter-exchange': 'dead_letters',
                'x-dead-letter-routing-key': 'registration_service.dead_letter',
              },
            },
          },

          // Create a queue for deleting users
          'registration_service:user:delete': {
            options: {
              arguments: {
                // Route nacked messages to a service specific dead letter queue
                'x-dead-letter-exchange': 'dead_letters',
                'x-dead-letter-routing-key': 'registration_service.dead_letter',
              },
            },
          },

          // Create a delay queue to hold failed messages for a short interval before retrying
          'delay:1m': {
            options: {
              arguments: {
                // Configure messages to expire after 1 minute, then route them to the retry exchange
                'x-message-ttl': 60000,
                'x-dead-letter-exchange': 'retry',
              },
            },
          },

          // Queue for holding dead letters until they can be resolved
          'dead_letters:registration_service': {},
        },

        // Bind the queues to the exchanges.
        // A good naming convention for routing keys is producer.entity.event
        bindings: {
          // Route create/update user messages to the save queue
          'service[registration_webapp.user.created.#,registration_webapp.user.updated.#] -> registration_service:user:save': {},

          // Route delete user messages to the delete queue
          'service[registration_webapp.user.deleted.#] -> registration_service:user:delete': {},

          // Route delayed messages to the 1 minute delay queue
          'delay[delay.1m] -> delay:1m': {},

          // Route retried messages back to their original queue using the CC routing keys set by Rascal
          'retry[registration_service:user:save.#] -> registration_service:user:save': {},
          'retry[registration_service:user:delete.#] -> registration_service:user:delete': {},

          // Route dead letters the service specific dead letter queue
          'dead_letters[registration_service.dead_letter] -> dead_letters:registration_service': {},
        },

        // Setup subscriptions
        subscriptions: {
          save_user: {
            queue: 'registration_service:user:save',
            handler: 'saveUser.js',
            redeliveries: {
              limit: 5,
              counter: 'shared',
            },
          },

          delete_user: {
            queue: 'registration_service:user:delete',
            handler: 'deleteUser.js',
            redeliveries: {
              limit: 5,
              counter: 'shared',
            },
          },
        },

        // Setup publications
        publications: {
          // Always publish a notification of success (it's useful for testing if nothing else)
          save_user_succeeded: {
            exchange: 'service',
          },
          delete_user_succeeded: {
            exchange: 'service',
            encryption: 'well-known-v1',
          },

          // Forward messages to the 1 minute delay queue when retrying
          retry_in_1m: {
            exchange: 'delay',
            options: {
              CC: ['delay.1m'],
            },
          },

          // Publication for generating user create, update and delete messages
          // This would probably be the job of another application (e.g. a web application)
          user_event: {
            exchange: 'service',
            // Specifying an encryption profile in the publication will cause the message content to be encrypted
            // The profile name and iv are added as headers, and used to automatically decrypt messages,
            // providing the consumer configuration has a matching profile.
            encryption: 'well-known-v1',
          },
        },

        // Configure confirm channel pools. See https://www.npmjs.com/package/generic-pool
        // The demo application doesn't publish using regular channels. A regular pool will be created by default, but
        // never allocated channels because autostart defaults to false.
        publicationChannelPools: {
          confirmPool: {
            max: 10,
            min: 5,
            autostart: true,
          },
        },
      },
    },
    // Define recovery strategies for different error scenarios
    recovery: {
      // Deferred retry is a good strategy for temporary (connection timeout) or unknown errors
      deferred_retry: [
        {
          strategy: 'forward',
          attempts: 10,
          publication: 'retry_in_1m',
          xDeathFix: true, // See https://github.com/rabbitmq/rabbitmq-server/issues/161
        },
        {
          strategy: 'nack',
        },
      ],

      // Republishing with immediate nack returns the message to the original queue but decorates
      // it with error headers. The next time Rascal encounters the message it immediately nacks it
      // causing it to be routed to the services dead letter queue
      dead_letter: [
        {
          strategy: 'republish',
          immediateNack: true,
        },
      ],
    },
    // Define counter(s) for counting redeliveries
    redeliveries: {
      counters: {
        shared: {
          size: 10,
          type: 'inMemoryCluster',
        },
      },
    },
    // Define encryption profiles
    encryption: {
      'well-known-v1': {
        key: 'f81db52a3b2c717fe65d9a3b7dd04d2a08793e1a28e3083db3ea08db56e7c315',
        ivLength: 16,
        algorithm: 'aes-256-cbc',
      },
    },
  },
};
