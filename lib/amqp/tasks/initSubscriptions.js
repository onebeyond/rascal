const debug = require('debug')('rascal:tasks:initSubscriptions');
const _ = require('lodash');
const async = require('async');
const Subscription = require('../Subscription');

module.exports = _.curry((config, ctx, next) => {
  async.eachSeries(
    _.values(config.subscriptions),
    (subscriptionConfig, callback) => {
      initSubscription(subscriptionConfig, ctx, (err, subscription) => {
        ctx.broker._addSubscription(subscription);
        callback(err);
      });
    },
    (err) => {
      next(err, config, ctx);
    }
  );
});

function initSubscription(config, ctx, next) {
  Subscription.create(ctx.broker, ctx.vhosts[config.vhost], ctx.counters[config.redeliveries.counter], config, next);
}
