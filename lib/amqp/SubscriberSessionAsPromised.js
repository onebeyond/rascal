const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;
const forwardEvents = require('forward-emitter');

module.exports = SubscriberSessionAsPromised;

inherits(SubscriberSessionAsPromised, EventEmitter);

function SubscriberSessionAsPromised(session) {
  forwardEvents(session, this);

  this.name = session.name;
  this.config = session.config;

  this.cancel = function () {
    return new Promise((resolve, reject) => {
      session.cancel((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  };
}
