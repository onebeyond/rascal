const exponential = require('./exponential');
const linear = require('./linear');

const strategies = {
  exponential,
  linear,
};

module.exports = function (options) {
  if (options.delay) return strategies.linear({ min: options.delay });
  if (options.strategy) return strategies[options.strategy](options);
  return strategies.exponential();
};
