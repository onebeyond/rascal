const get = require('lodash').get;

module.exports = function (options) {
  const min = get(options, 'min', 1000);
  const max = get(options, 'max', Math.pow(min, 10));
  const factor = get(options, 'factor', 2);
  const randomise = get(options, 'randomise', true);
  let lower = min;

  function next() {
    if (lower > max) return max;
    const upper = lower * factor;
    const value = randomise ? Math.floor(Math.random() * (upper - lower + 1) + lower) : lower;
    const capped = Math.min(max, value);
    lower = upper;
    return capped;
  }

  function reset() {
    lower = min;
  }

  return {
    next,
    reset,
  };
};
