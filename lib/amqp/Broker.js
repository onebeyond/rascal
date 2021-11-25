const debug = require('debug')('rascal:Broker');
const format = require('util').format;
const inherits = require('util').inherits;
const EventEmitter = require('events').EventEmitter;
const _ = require('lodash');
const async = require('async');
const tasks = require('./tasks');
const configure = require('../config/configure');
const validate = require('../config/validate');
const fqn = require('../config/fqn');
const preflight = async.compose(validate, configure);
const stub = require('../counters/stub');
const inMemory = require('../counters/inMemory');
const inMemoryCluster = require('../counters/inMemoryCluster').worker;
const setTimeoutUnref = require('../utils/setTimeoutUnref');
const maxInterval = 2147483647;

module.exports = {
  create: function create(config, components, next) {
    if (arguments.length === 2) return create(config, {}, arguments[1]);

    const counters = _.defaults({}, components.counters, {
      stub,
      inMemory,
      inMemoryCluster,
    });

    preflight(_.cloneDeep(config), (err, config) => {
      if (err) return next(err);
      new Broker(config, _.assign({}, components, { counters }))._init(next);
    });
  },
};

inherits(Broker, EventEmitter);

function Broker(config, components) {
  const self = this;
  let vhosts = {};
  let publications = {};
  let subscriptions = {};
  let sessions = [];
  const init = async.compose(tasks.initShovels, tasks.initSubscriptions, tasks.initPublications, tasks.initCounters, tasks.initVhosts);
  const nukeVhost = async.compose(tasks.deleteVhost, tasks.shutdownVhost, tasks.nukeVhost);
  const purgeVhost = tasks.purgeVhost;
  const forewarnVhost = tasks.forewarnVhost;
  const shutdownVhost = tasks.shutdownVhost;
  const bounceVhost = tasks.bounceVhost;

  this.config = _.cloneDeep(config);
  this.promises = false;

  this._init = function (next) {
    debug('Initialising broker');
    vhosts = {};
    publications = {};
    subscriptions = {};
    sessions = [];
    init(config, { broker: self, components }, (err) => {
      self.keepActive = setInterval(_.noop, maxInterval);
      setImmediate(() => {
        next(err, self);
      });
    });
  };

  this.connect = function (name, next) {
    if (!vhosts[name]) return next(new Error(format('Unknown vhost: %s', name)));
    vhosts[name].connect(next);
  };

  this.purge = function (next) {
    debug('Purging all queues in all vhosts');
    async.eachSeries(
      _.values(vhosts),
      (vhost, callback) => {
        purgeVhost(config, { vhost }, callback);
      },
      (err) => {
        if (err) return next(err);
        debug('Finished purging all queues in all vhosts');
        next();
      }
    );
  };

  this.shutdown = function (next) {
    debug('Shutting down broker');
    async.eachSeries(
      _.values(vhosts),
      (vhost, callback) => {
        forewarnVhost(config, { vhost }, callback);
      },
      (err) => {
        if (err) return next(err);
        self.unsubscribeAll((err) => {
          if (err) self.emit('error', err);
          async.eachSeries(
            _.values(vhosts),
            (vhost, callback) => {
              shutdownVhost(config, { vhost }, callback);
            },
            (err) => {
              if (err) return next(err);
              clearInterval(self.keepActive);
              debug('Finished shutting down broker');
              next();
            }
          );
        });
      }
    );
  };

  this.bounce = function (next) {
    debug('Bouncing broker');
    self.unsubscribeAll((err) => {
      if (err) self.emit('error', err);
      async.eachSeries(
        _.values(vhosts),
        (vhost, callback) => {
          bounceVhost(config, { vhost }, callback);
        },
        (err) => {
          if (err) return next(err);
          debug('Finished bouncing broker');
          next();
        }
      );
    });
  };

  this.nuke = function (next) {
    debug('Nuking broker');
    self.unsubscribeAll((err) => {
      if (err) self.emit('error', err);
      async.eachSeries(
        _.values(vhosts),
        (vhost, callback) => {
          nukeVhost(config, { vhost, components }, callback);
        },
        (err) => {
          if (err) return next(err);
          vhosts = publications = subscriptions = {};
          clearInterval(self.keepActive);
          debug('Finished nuking broker');
          next();
        }
      );
    });
  };

  this.publish = function (name, message, overrides, next) {
    if (arguments.length === 3) return self.publish(name, message, {}, arguments[2]);
    if (_.isString(overrides)) return self.publish(name, message, { routingKey: overrides }, next);
    if (!publications[name]) return next(new Error(format('Unknown publication: %s', name)));
    publications[name].publish(message, overrides, next);
  };

  this.forward = function (name, message, overrides, next) {
    if (arguments.length === 3) return self.forward(name, message, {}, arguments[2]);
    if (_.isString(overrides)) return self.forward(name, message, { routingKey: overrides }, next);
    if (!config.publications[name]) return next(new Error(format('Unknown publication: %s', name)));
    publications[name].forward(message, overrides, next);
  };

  this.subscribe = function (name, overrides, next) {
    if (arguments.length === 2) return self.subscribe(name, {}, arguments[1]);
    if (!subscriptions[name]) return next(new Error(format('Unknown subscription: %s', name)));
    subscriptions[name].subscribe(overrides, (err, session) => {
      if (err) return next(err);
      sessions.push(session);
      next(null, session);
    });
  };

  this.subscribeAll = function (filter, next) {
    if (arguments.length === 1)
      return self.subscribeAll(() => {
        return true;
      }, arguments[0]);
    const filteredSubscriptions = _.chain(config.subscriptions).values().filter(filter).value();
    async.mapSeries(
      filteredSubscriptions,
      (subscriptionConfig, cb) => {
        self.subscribe(subscriptionConfig.name, (err, subscription) => {
          if (err) return cb(err);
          cb(null, subscription);
        });
      },
      next
    );
  };

  this.unsubscribeAll = function (next) {
    async.each(
      sessions.slice(),
      (session, cb) => {
        sessions.shift();
        session.cancel(cb);
      },
      next
    );
  };

  this.getConnections = function () {
    return Object.keys(vhosts).map((name) => {
      return vhosts[name].getConnectionDetails();
    });
  };

  this.getFullyQualifiedName = this.qualify = function (vhost, name) {
    return fqn.qualify(name, config.vhosts[vhost].namespace);
  };

  this._addVhost = function (vhost) {
    vhosts[vhost.name] = vhost;
  };

  this._addPublication = function (publication) {
    publications[publication.name] = publication;
  };

  this._addSubscription = function (subscription) {
    subscriptions[subscription.name] = subscription;
  };
}
