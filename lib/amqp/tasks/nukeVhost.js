module.exports = function (config, ctx, next) {
  ctx.vhost.nuke((err) => {
    if (err) return next(err);
    return next(null, config, ctx);
  });
};
