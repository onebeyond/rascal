module.exports = function(config, ctx, next) {
  ctx.vhost.forewarn(function(err) {
    if (err) return next(err);
    return next(null, config, ctx);
  });
};
