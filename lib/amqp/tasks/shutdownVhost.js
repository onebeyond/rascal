module.exports = function (config, ctx, next) {
  ctx.vhost.shutdown((err) => {
    if (err) return next(err);
    return next(null, config, ctx);
  });
};
