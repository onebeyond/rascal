const debug = require('debug')('rascal:tasks:closeChannel');
const _ = require('lodash');

module.exports = _.curry((config, ctx, next) => {
  debug('Closing channel');

  ctx.channel.close((err) => {
    if (err) return next(err, config, ctx);
    delete ctx.channel;
    next(null, config, ctx);
  });
});
