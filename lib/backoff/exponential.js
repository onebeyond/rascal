var get = require('lodash').get;

module.exports = function(options) {

  var min = get(options, 'min', 1000);
  var max = get(options, 'max', Math.pow(min, 10));
  var factor = get(options, 'factor', 2);
  var randomise = get(options, 'randomise', true);
  var lower = min;

  function next() {
    if (lower > max) {
      return max;
    }
    var upper = lower * factor;
    var value = randomise ? Math.floor(Math.random() * (upper - lower + 1) + lower) : lower;
    var capped = Math.min(max, value);
    lower = upper;
    return capped;
  }

  function reset() {
    lower = min;
  }

  return {
    next: next,
    reset: reset,
  };
};
