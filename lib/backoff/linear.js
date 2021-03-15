const get = require('lodash').get;

module.exports = function(options) {

  const min = get(options, 'min', 1000);
  const max = get(options, 'max', min);

  function next() {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  function reset() {
  }

  return {
    next: next,
    reset: reset,
  };
};
