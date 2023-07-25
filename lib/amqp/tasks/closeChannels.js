const debug = require('debug')('rascal:tasks:closeChannels');
const async = require('async');
const _ = require('lodash');

module.exports = _.curry((config, ctx, next) => {
  debug('Closing %d channels', ctx.channels.length);

  async.each(
    ctx.channels,
    (channel, cb) => {
      channel.close(cb);
    },
    (err) => {
      delete ctx.channels;
      return next(err, config, ctx);
    },
  );
});
