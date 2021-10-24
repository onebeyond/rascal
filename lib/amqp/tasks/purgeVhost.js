module.exports = function (config, ctx, next) {
  ctx.vhost.purge((err) => {
    if (err) return next(err);
    return next(null, config, ctx);
  });
};
