var chalk = require('chalk');
var format = require('util').format;

module.exports = function (broker) {
  return function (user, cb) {
    // Pretend we'd really asynchronously saved something
    setImmediate(function () {
      console.log(chalk.magenta('Saving user:'), user.username);

      if (user.crash) throw new Error('Crashing on user: ' + user.username);

      // Simulate errors and success
      var err;
      switch (Math.floor(Math.random() * 10)) {
        case 5: {
          err = new Error('Connection Timeout');
          err.recoverable = true;
          return cb(err);
        }
        case 7: {
          err = new Error('Duplicate Key Violation');
          err.recoverable = false;
          return cb(err);
        }
        default: {
          var routingKey = format('registration_service.user.saved.%s', user.username);
          broker.publish('save_user_succeeded', routingKey, function (err, publication) {
            if (err) return cb(err);
            publication.on('success', () => cb).on('error', console.error);
          });
        }
      }
    });
  };
};
