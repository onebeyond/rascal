var _ = require('lodash').runInContext()
var defaultConfig = require('./defaults')

_.mixin({ 'defaultsDeep': require('merge-defaults') });

module.exports = _.defaultsDeep({
    defaults: {
        vhosts: {
            namespace: true,
            exchanges: {
                options: {
                    durable: false
                }
            },
            queues: {
                purge: true,
                options: {
                    durable: false
                }
            }
        },
        publications: {
            options: {
                persistent: false
            }
        }
    },
    redeliveries: {
        "caches": {
            "noCache": {},
            "inMemory": {
                "size": 1000
            }
        }
    }
}, defaultConfig)