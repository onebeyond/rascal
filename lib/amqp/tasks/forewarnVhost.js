module.exports = function (config, ctx, next) {
  ctx.vhost.forewarn((err) => {
    if (err) return next(err);
    return next(null, config, ctx);
  });
};
