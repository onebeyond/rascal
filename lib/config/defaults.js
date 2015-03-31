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
            retry: {
                delay: 1000
            },
            options: {
                heartbeat: 5
            },
            get auth() { return this.user + ':' + this.password },
            get pathname() { return this.vhost },
            get query() { return this.options }
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
            arguments: {}
        },
        publications: {
            options: {
                persistent: true
            }
        }
    }
}