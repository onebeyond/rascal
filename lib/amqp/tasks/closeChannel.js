const debug = require('debug')('rascal:tasks:closeChannel');
const _ = require('lodash');

module.exports = _.curry(function(config, ctx, next) {

  debug('Closing channel');

  ctx.channel.close(function(err) {
    if (err) return next(err, config, ctx);
    delete ctx.channel;
    next(null, config, ctx);
  });
});
