module.exports = function (options = {}) {
  const min = options.min || 1000;
  const max = options.max || min;
  const range = max - min;

  function next() {
    return range === 0 ? min : Math.floor(Math.random() * (range + 1) + min);
  }

  return { next, reset: () => {} };
};
