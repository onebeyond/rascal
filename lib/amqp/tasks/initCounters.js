const debug = require('debug')('rascal:tasks:initCounters');
const format = require('util').format;
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  ctx.counters = {};
  async.eachSeries(
    _.values(config.redeliveries.counters),
    (counterConfig, callback) => {
      initCounter(counterConfig, ctx, (err, counter) => {
        ctx.counters[counterConfig.name] = counter;
        callback(err);
      });
    },
    (err) => {
      next(err, config, ctx);
    }
  );
});

function initCounter(config, ctx, next) {
  if (!ctx.components.counters[config.type]) return next(new Error(format('Unknown counter type: %s', config.type)));
  next(null, ctx.components.counters[config.type](config));
}
