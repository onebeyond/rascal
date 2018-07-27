module.exports = function(options) {

  return {
    incrementAndGet: function(key, next) {
      next(null, 0)
    }
  }
}