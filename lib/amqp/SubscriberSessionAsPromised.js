var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var forwardEvents = require('forward-emitter');

module.exports = SubscriberSessionAsPromised;

inherits(SubscriberSessionAsPromised, EventEmitter);

function SubscriberSessionAsPromised(session) {

  forwardEvents(session, this);

  this.cancel = function() {
    return new Promise(function(resolve, reject) {
      session.cancel(function(err) {
        if (err) return reject(err);
        resolve();
      });
    });
  };

}
