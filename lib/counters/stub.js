module.exports = function() {

  return {
    incrementAndGet: function(key, next) {
      next(null, 0);
    },
  };
};