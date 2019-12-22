var debug = require('debug')('rascal:tasks:initShovels');
var _ = require('lodash');
var async = require('async');

module.exports = _.curry(function(config, ctx, next) {
  async.eachSeries(_.values(config.shovels), function(shovelConfig, callback) {
    initShovel(shovelConfig, ctx, callback);
  }, function(err) {
    next(err, config, ctx);
  });
});

function initShovel(config, ctx, next) {
  debug('Initialising shovel: %s', config.name);

  ctx.broker.subscribe(config.subscription, {}, function(err, subscription) {
    if (err) return next(err);

    subscription.on('message', function(message, content, ackOrNack) {
      ctx.broker.forward(config.publication, message, {}, function(err, publication) {
        if (err) return next(err);
        publication.on('success', function() {
          ackOrNack();
        });
      });
    });

    subscription.on('error', function(err) {
      ctx.broker.emit('error', err);
    });

    subscription.on('cancelled', function(err) {
      ctx.broker.emit('cancelled', err) || ctx.broker.emit('error', err);
    });

    next();
  });
}
