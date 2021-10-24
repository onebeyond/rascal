const strategies = {
  exponential: require('./exponential'),
  linear: require('./linear'),
};

module.exports = function (options) {
  if (options.delay) return strategies.linear({ min: options.delay });
  if (options.strategy) return strategies[options.strategy](options);
  return strategies.exponential();
};
