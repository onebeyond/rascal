var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var forwardEvents = require('forward-emitter');

module.exports = SubscriberSessionAsPromised;

inherits(SubscriberSessionAsPromised, EventEmitter);

function SubscriberSessionAsPromised(session) {

  forwardEvents(session, this);

  this.close = this.cancel = function() {
    return new Promise(function(resolve, reject) {
      session.close(function(err) {
        if (err) return reject(err);
        resolve();
      });
    });
  };

}
