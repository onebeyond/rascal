var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var forwardEvents = require('forward-emitter');
var _ = require('lodash');
var Broker = require('./Broker');
var SubscriberSessionAsPromised = require('./SubscriberSessionAsPromised');

module.exports = {
  create: function() {
    var args = Array.prototype.slice.call(arguments);
    return new Promise(function(resolve, reject) {
      Broker.create.apply(Broker, args.concat(function(err, broker) {
        if (err) return reject(err);
        resolve(new BrokerAsPromised(broker));
      }));
    });
  },
};

inherits(BrokerAsPromised, EventEmitter);

function BrokerAsPromised(broker) {

  var methods = ['connect', 'nuke', 'purge', 'shutdown', 'bounce', 'publish', 'forward', 'unsubscribeAll'];
  var self = this;

  forwardEvents(broker, this);

  _.each(methods, function(method) {
    self[method] = function() {
      var args = Array.prototype.slice.call(arguments);
      return new Promise(function(resolve, reject) {
        broker[method].apply(broker, args.concat(function(err, result) {
          if (err) return reject(err);
          resolve(result);
        }));
      });
    };
  });

  this.config = broker.config;

  this.subscribe = function() {
    var args = Array.prototype.slice.call(arguments);
    return new Promise(function(resolve, reject) {
      broker.subscribe.apply(broker, args.concat(function(err, session) {
        if (err) return reject(err);
        resolve(new SubscriberSessionAsPromised(session));
      }));
    });
  };

  this.subscribeAll = function() {
    var args = Array.prototype.slice.call(arguments);
    return new Promise(function(resolve, reject) {
      broker.subscribeAll.apply(broker, args.concat(function(err, sessions) {
        if (err) return reject(err);
        resolve(sessions.map(function(session) {
          return new SubscriberSessionAsPromised(session);
        }));
      }));
    });
  };

  this.getFullyQualifiedName = this.qualify = function(vhost, name) {
    return broker.qualify(vhost, name);
  };
}
