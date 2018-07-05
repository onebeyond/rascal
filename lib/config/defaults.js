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
                    heartbeat: 10,
                    connection_timeout: 10000,
                    channelMax: 100
                },
                retry: {
                    min: 1000,
                    max: 60000,
                    factor: 2,
                    strategy: 'exponential'
                },
                socketOptions: {
                    timeout: 10000
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
                min: 1000,
                max: 60000,
                factor: 2,
                strategy: 'exponential'
            },
            redeliveries: {
                limit: 100,
                timeout: 1000,
                counter: 'stub'
            },
            deferCloseChannel: 60000
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
