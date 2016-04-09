module.exports = {
  "rascal": {
    "vhosts": {

      "registration": {

        // Define the vhost connection parameters. Specify multiple entries for cluster
        "connections": [
          {
            "user": "app_user",
            "password": "password",
            "port": 5672
          }
        ],

        // Define exchanges within the registration vhost
        "exchanges": [
          "service",      // Shared exchange for all services within this vhost
          "delay",        // To delay failed messages before a retry
          "retry",        // To retry failed messages a up to maximum number of times
          "dead_letters"  // When retring fails messages end up here
        ],

        // Define queues within the registration vhost
        // A good naming convension for queues is consumer:entity:action
        "queues": {

          // Create a queue for saving users
          "registration_service:user:save": {
            "options": {
              "arguments": {
                // Route nacked messages to a service specific dead letter queue
                "x-dead-letter-exchange": "dead_letters",
                "x-dead-letter-routing-key": "registration_service.dead_letter"
              }
            }
          },

          // Create a queue for deleting users
          "registration_service:user:delete": {
            "options": {
              "arguments": {
                // Route nacked messages to a service specific dead letter queue
                "x-dead-letter-exchange": "dead_letters",
                "x-dead-letter-routing-key": "registration_service.dead_letter"
              }
            }
          },

          // Create a delay queues to hold failed messages for a short interval before retrying
          "delay:1m": {
            "options": {
              "arguments": {
                // Configure messages to expire after 1 minute, then route to the retry exchange
                "x-message-ttl": 60000,
                "x-dead-letter-exchange": "retry"
              }
            }
          },

          // Queue for holding dead letters until they can be resolved
          "dead_letters:registration_service": {}
        },

        // Bind the queues to the exchanges.
        // A good naming convention for routing keys is producer.entity.event
        "bindings": {

          // Route create/update user messages to the save queue
          "service[registration_webapp.user.created.#,registration_webapp.user.updated.#] -> registration_service:user:save": {},

          // Route delete user messages to the delete queue
          "service[registration_webapp.user.deleted.#] -> registration_service:user:delete": {},

          // Route delayed messages to the 1 minute delay queue
          "delay[delay.1m] -> delay:1m": {},

          // Route retried messages back to their original queue using the CC routing keys set by Rascal
          "retry[registration_service:user:save.#] -> registration_service:user:save": {},
          "retry[registration_service:user:delete.#] -> registration_service:user:delete": {},

          // Route dead letters the service specific dead letter queue
          "dead_letters[registration_service.dead_letter] -> dead_letters:registration_service": {}

        },

        // Setup subscriptions
        "subscriptions": {

          "save_user": {
            "queue": "registration_service:user:save",
            "handler": "saveUser.js"
          },

          "delete_user": {
            "queue": "registration_service:user:delete",
            "handler": "deleteUser.js"
          }
        },

        // Setup publications
        "publications": {

          // Always publish a notification of success (it's useful for testing if nothing else)
          "save_user_succeeded": {
            "exchange": "service"
          },
          "delete_user_succeeded": {
            "exchange": "service"
          },

          // Forward messages to the 1 minute delay queue when retrying
          "retry_in_1m": {
            "exchange": "delay",
            "options": {
              "CC": ["delay.1m"]
            }
          },

          // Publication for generating user create, update and delete messages
          // This would probably be the job of another application (e.g. a web application)
          "user_event": {
            "exchange": "service"
          }
        }
      }
    },
  // Definte recovery strategies for different error scenarios
    "recovery": {

      // Deferred retry is a good strategy for temporary (connection timeout) or unknown errors
      "deferred_retry": [
        {
         "strategy": "forward",
          "attempts": 10,
          "publication": "retry_in_1m",
          "xDeathFix": true // See https://github.com/rabbitmq/rabbitmq-server/issues/161
        }, {
          "strategy": "nack"
        }
      ],

      // Republishing with immediate nack returns the message to the original queue but decorates
      // it with error headers. The next time Rascal encounters the message it immedately nacks it
      // causing it to be routed to the services dead letter queue
      "dead_letter": [
        {
          "strategy": "republish",
          "immediateNack": true
        }
      ]
    }
  }
}
