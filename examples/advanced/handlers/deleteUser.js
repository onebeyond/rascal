var format = require('util').format
var chalk = require('chalk')

module.exports = function(broker) {
    return function(user, cb) {

        // Pretend we'd really deleted something
        console.log(chalk.cyan('Deleting user:'), user.username)

        var routingKey = format('registration_service.user.deleted.%s', user.username)
        broker.publish('delete_user_succeeded', routingKey, function(err, publication) {
            publication.on('success', cb).on('error', console.error)
        })
    }
}
