var format = require('util').format
var chalk = require('chalk')

module.exports = function(broker) {
    return function(user, cb) {

        // Pretend we'd really saved something
        console.log(chalk.magenta('Saving user:'), user.username)

        // Simulate errors and success
        switch (Math.floor(Math.random() * 10)) {
            case 5: {
                var err = new Error('Connection Timeout')
                err.recoverable = true
                return cb(err)
            }
            case 7: {
                var err = new Error('Duplicate Key Violation')
                err.recoverable = false
                return cb(err)
            }
            default: {
                var routingKey = format('registration_service.user.saved.%s', user.username)
                broker.publish('save_user_succeeded', routingKey, function(err, publication) {
                    publication.on('success', cb).on('error', console.error)
                })
            }
        }
    }
}