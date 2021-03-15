const debug = require('debug')('rascal:tasks:initPublication');
const _ = require('lodash');
const async = require('async');
const Publication = require('../Publication');

module.exports = _.curry(function(config, ctx, next) {
  async.eachSeries(_.values(config.publications), function(publicationConfig, callback) {
    initPublication(publicationConfig, ctx, function(err, publication) {
      if (err) return callback(err);
      ctx.broker._addPublication(publication);
      callback();
    });
  }, function(err) {
    next(err, config, ctx);
  });
});

function initPublication(config, ctx, next) {
  Publication.create(ctx.vhosts[config.vhost], config, next);
}
