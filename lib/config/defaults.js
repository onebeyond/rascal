module.exports = {
    defaults: {
        vhosts: {
            connection: {
                slashes: true,
                protocol: 'amqp',
                hostname: 'localhost',
                user: 'guest',
                password: 'guest',
                port: '5672',
                options: {
                    heartbeat: 5
                },
                retry: {
                    delay: 1000
                }
            },
            exchanges: {
                assert: true,
                type: 'topic'
            },
            queues: {
                assert: true
            },
            bindings: {
                destinationType: 'queue',
                bindingKey: '#'
            }
        },
        publications: {
            vhost: '/',
            routingKey: '',
            confirm: true,
            options: {
                persistent: true
            }
        },
        subscriptions: {
            vhost: '/',
            prefetch: 10,
            retry: {
                delay: 1000
            }
        }
    }
}