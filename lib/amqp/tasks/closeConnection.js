const debug = require('debug')('rascal:tasks:checkQueues');
const _ = require('lodash');

module.exports = _.curry((config, ctx, next) => {
  debug('Closing connection: %s', ctx.connectionConfig.loggableUrl);
  if (!ctx.connection) return next(null, config, ctx);
  ctx.connection.close((err) => {
    next(err, config, ctx);
  });
});
