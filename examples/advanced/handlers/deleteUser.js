var chalk = require('chalk');
var format = require('util').format;

module.exports = function (broker) {
  return function (user, cb) {
    // Pretend we'd really asynchronously deleted something
    setImmediate(function () {
      console.log(chalk.cyan('Deleting user:'), user.username);

      if (user.crash) throw new Error('Crashing on user: ' + user.username);

      var routingKey = format('registration_service.user.deleted.%s', user.username);
      broker.publish('delete_user_succeeded', routingKey, function (err, publication) {
        if (err) return cb(err);
        publication.on('success', () => cb).on('error', console.error);
      });
    });
  };
};
