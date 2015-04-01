var _ = require('lodash').runInContext()
var defaultConfig = require('./defaults')

_.mixin({ 'defaultsDeep': require('merge-defaults') });

module.exports = _.defaultsDeep({
    defaults: {
        vhosts: {
            namespace: true
        },
        exchanges: {
            durable: false,
            autoDelete: true
        },
        queues: {
            durable: false,
            exclusive: true,
            purge: true
        },
        publications: {
            options: {
                persistent: false
            }
        }
    }
}, defaultConfig)