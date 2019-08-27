module.exports = function(config, ctx, next) {
  ctx.vhost.shutdown(function(err) {
    if (err) return next(err);
    return next(null, config, ctx);
  });
};
