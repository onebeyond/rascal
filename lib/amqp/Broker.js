var debug = require('debug')('rascal:Broker');
var format = require('util').format;
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var async = require('async');
var tasks = require('./tasks');
var configure = require('../config/configure');
var validate = require('../config/validate');
var fqn = require('../config/fqn');
var preflight = async.compose(validate, configure);
var stub = require('../counters/stub');
var inMemory = require('../counters/inMemory');
var inMemoryCluster = require('../counters/inMemoryCluster').worker;

module.exports = {
  create: function create(config, components, next) {
    if (arguments.length === 2) return create(config, {}, arguments[1]);
    preflight(_.cloneDeep(config), function(err, config) {
      if (err) return next(err);
      new Broker(config, components)._init(next);
    });
  },
};

inherits(Broker, EventEmitter);

function Broker(config, components) {

  var self = this;
  var vhosts = {};
  var publications = {};
  var subscriptions = {};
  var sessions = [];
  var init = async.compose(tasks.initShovels, tasks.initSubscriptions, tasks.initPublications, tasks.initCounters, tasks.initVhosts);
  var nukeVhost = async.compose(tasks.deleteVhost, tasks.shutdownVhost, tasks.nukeVhost);
  var purgeVhost = tasks.purgeVhost;
  var shutdownVhost = tasks.shutdownVhost;
  var bounceVhost = tasks.bounceVhost;
  var counters = _.defaults({}, components.counters, { stub: stub, inMemory: inMemory, inMemoryCluster: inMemoryCluster });

  this.config = config;

  this._init = function(next) {
    debug('Initialising broker');
    vhosts = {};
    publications = {};
    subscriptions = {};
    sessions = [];
    init(config, { broker: self, components: { counters: counters } }, function(err, config, ctx) {
      setImmediate(function() {
        next(err, self);
      });
    });
    return this;
  };

  this.connect = function(name, next) {
    if (!vhosts[name]) return next(new Error(format('Unknown vhost: %s', name)));
    vhosts[name].connect(next);
  };

  this.nuke = function(next) {
    debug('Nuking broker');
    self.unsubscribeAll(function(err) {
      if (err) return next(err);
      async.eachSeries(_.values(vhosts), function(vhost, callback) {
        nukeVhost(config, { vhost: vhost }, callback);
      }, function(err) {
        if (err) return next(err);
        vhosts = publications = subscriptions = {};
        debug('Finished nuking broker');
        next();
      });
    });
    return this;
  };

  this.purge = function(next) {
    debug('Purging all queues in all vhosts');
    async.eachSeries(_.values(vhosts), function(vhost, callback) {
      purgeVhost(config, { vhost: vhost }, callback);
    }, function(err) {
      if (err) return next(err);
      debug('Finished purging all queues in all vhosts');
      next();
    });
    return this;
  };

  this.shutdown = function(next) {
    debug('Shutting down broker');
    self.unsubscribeAll(function(err) {
      if (err) return next(err);
      async.eachSeries(_.values(vhosts), function(vhost, callback) {
        shutdownVhost(config, { vhost: vhost }, callback);
      }, function(err) {
        if (err) return next(err);
        debug('Finished shutting down broker');
        next();
      });
    });
    return this;
  };

  this.bounce = function(next) {
    debug('Bouncing broker');
    self.unsubscribeAll(function(err) {
      if (err) return next(err);
      async.eachSeries(_.values(vhosts), function(vhost, callback) {
        bounceVhost(config, { vhost: vhost }, callback);
      }, function(err) {
        if (err) return next(err);
        debug('Finished bouncing broker');
        next();
      });
    });
    return this;
  };

  this.publish = function(name, message, overrides, next) {
    if (arguments.length === 3) return self.publish(name, message, {}, arguments[2]);
    if (_.isString(overrides)) return self.publish(name, message, { routingKey: overrides }, next);
    if (!publications[name]) return next(new Error(format('Unknown publication: %s', name)));
    publications[name].publish(message, overrides, next);
    return this;
  };

  this.forward = function(name, message, overrides, next) {
    if (arguments.length === 3) return self.forward(name, message, {}, arguments[2]);
    if (_.isString(overrides)) return self.forward(name, message, { routingKey: overrides }, next);
    if (!config.publications[name]) return next(new Error(format('Unknown publication: %s', name)));
    publications[name].forward(message, overrides, next);
    return this;
  };

  this.subscribe = function(name, overrides, next) {
    if (arguments.length === 2) return self.subscribe(name, {}, arguments[1]);
    if (!subscriptions[name]) return next(new Error(format('Unknown subscription: %s', name)));
    subscriptions[name].subscribe(overrides, function(err, session) {
      if (err) return next(err);
      sessions.push(session);
      next(null, session);
    });
    return this;
  };

  this.unsubscribeAll = function(next) {
    var timeout = getMaxDeferCloseChannelTimeout();
    async.eachSeries(sessions.slice(), function(session, cb) {
      sessions.shift();
      session.cancel(cb);
    }, function(err) {
      if (err) return next(err);
      debug('Waiting %dms for all subscriber channels to close', timeout);
      setTimeout(next, timeout).unref();
    });
  };

  this.getFullyQualifiedName = this.qualify = function(vhost, name) {
    return fqn.qualify(name, config.vhosts[vhost].namespace);
  };

  this._addVhost = function(vhost) {
    vhosts[vhost.name] = vhost;
  };

  this._addPublication = function(publication) {
    publications[publication.name] = publication;
  };

  this._addSubscription = function(subscription) {
    subscriptions[subscription.name] = subscription;
  };

  function getMaxDeferCloseChannelTimeout() {
    return sessions.reduce(function(value, session) {
      return session._maxDeferCloseChannel(value);
    }, 0);
  }
}
