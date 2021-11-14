const debug = require('debug')('rascal:tasks:initVhosts');
const _ = require('lodash');
const async = require('async');
const forwardEvents = require('forward-emitter');
const Vhost = require('../Vhost');

module.exports = _.curry((config, ctx, next) => {
  ctx.vhosts = {};
  async.eachSeries(
    _.values(config.vhosts),
    (vhostConfig, callback) => {
      initVhost(vhostConfig, ctx.components, (err, vhost) => {
        if (err) return callback(err);
        vhost.setMaxListeners(0);
        forwardEvents(vhost, ctx.broker);
        ctx.broker._addVhost(vhost);
        ctx.vhosts[vhostConfig.name] = vhost;
        callback();
      });
    },
    (err) => {
      next(err, config, ctx);
    }
  );
});

function initVhost(config, components, next) {
  Vhost.create(config, components, next);
}
