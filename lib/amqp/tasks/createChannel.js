const debug = require('debug')('rascal:tasks:createChannel');
const _ = require('lodash');

module.exports = _.curry((config, ctx, next) => {
  debug('Creating channel');

  ctx.connection.createChannel((err, channel) => {
    if (err) return next(err, config, ctx);
    ctx.channel = channel;
    next(null, config, ctx);
  });
});
