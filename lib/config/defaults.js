module.exports = {
    defaults: {
        vhosts: {
            publicationChannelPools: {
                regularPoolSize: 1,
                confirmPoolSize: 1
            },
            connection: {
                slashes: true,
                protocol: 'amqp',
                hostname: 'localhost',
                user: 'guest',
                password: 'guest',
                port: '5672',
                options: {
                    heartbeat: 5,
                    connection_timeout: 5
                },
                retry: {
                    delay: 1000
                },
                socketOptions: {
                    timeout: 60000
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
            confirm: true,
            options: {
                persistent: true,
                mandatory: true
            }
        },
        subscriptions: {
            vhost: '/',
            prefetch: 10,
            retry: {
                delay: 1000
            },
            redeliveries: {
                limit: 100,
                counter: 'stub'
            }
        },
        redeliveries: {
            "counters": {
                "stub": {},
                "inMemory": {
                    "size": 1000
                }
            }
        }
    }
}
