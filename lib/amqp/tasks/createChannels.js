const debug = require('debug')('rascal:tasks:createChannel');
const async = require('async');
const _ = require('lodash');

module.exports = _.curry((config, ctx, next) => {
  debug('Creating %d channels', config.concurrency);

  async.times(
    config.concurrency,
    (index, cb) => {
      ctx.connection.createChannel(cb);
    },
    (err, channels) => {
      if (err) return next(err, config, ctx);
      ctx.channels = channels;
      next(null, config, ctx);
    }
  );
});
