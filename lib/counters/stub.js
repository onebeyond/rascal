module.exports = function () {
  return {
    incrementAndGet(key, next) {
      next(null, 0);
    },
  };
};
