module.exports = {
    defaults: {
        connection: {
            slashes:true,
            protocol: 'amqp',
            hostname: 'localhost',
            user: 'guest',
            password: 'guest',
            port: '5672',
            vhost: '',
            options: {
                heartbeat: 5
            },
            retry: {
                delay: 1000
            }
        },
        exchanges: {
            assert: true,
            type: 'topic',
            options: {
            }
        },
        queues: {
            assert: true,
            options: {
            }
        },
        bindings: {
            destinationType: 'queue',
            routingKey: '#',
            arguments: {}
        },
        publications: {
            routingKey: '',
            options: {
                persistent: true
            }
        },
        subscriptions: {
            retry: {
                delay: 1000
            },
            options: {
                noAck: true
            }
        }
    }
}