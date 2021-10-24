const debug = require('debug')('rascal:tasks:initShovels');
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  async.eachSeries(
    _.values(config.shovels),
    (shovelConfig, callback) => {
      initShovel(shovelConfig, ctx, callback);
    },
    (err) => {
      next(err, config, ctx);
    }
  );
});

function initShovel(config, ctx, next) {
  debug('Initialising shovel: %s', config.name);

  ctx.broker.subscribe(config.subscription, {}, (err, subscription) => {
    if (err) return next(err);

    subscription.on('message', (message, content, ackOrNack) => {
      ctx.broker.forward(config.publication, message, {}, (err, publication) => {
        if (err) return next(err);
        publication.on('success', () => {
          ackOrNack();
        });
      });
    });

    subscription.on('error', (err) => {
      ctx.broker.emit('error', err);
    });

    subscription.on('cancelled', (err) => {
      ctx.broker.emit('cancelled', err) || ctx.broker.emit('error', err);
    });

    next();
  });
}
