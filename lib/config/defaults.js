module.exports = {
    defaults: {
        vhosts: {
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
                type: 'topic'
            },
            queues: {
                assert: true
            },
            bindings: {
                destinationType: 'queue',
                routingKey: '#'
            }
        },
        publications: {
            routingKey: '',
            options: {
                persistent: true
            }
        },
        subscriptions: {
            prefetch: 100,
            retry: {
                delay: 1000
            }
        }
    }
}