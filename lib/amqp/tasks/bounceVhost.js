module.exports = function (config, ctx, next) {
  ctx.vhost.bounce((err) => {
    if (err) return next(err);
    return next(null, config, ctx);
  });
};
