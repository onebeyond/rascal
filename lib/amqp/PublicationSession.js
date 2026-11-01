const debug = require('debug')('rascal:PublicationSession');
const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;
const bindAsyncContext = require('../utils/bindAsyncContext');

module.exports = PublicationSession;

inherits(PublicationSession, EventEmitter);

function PublicationSession(vhost, messageId) {
  const self = this;
  let aborted = false;

  this.stats = {};

  // The session is created synchronously by broker.publish, so this captures the publisher's async context.
  // Publication events are triggered by amqplib callbacks (confirms, returns, channel errors) which run
  // outside of it, so emit is bound to the publisher's context for the benefit of listeners.
  this.emit = bindAsyncContext(EventEmitter.prototype.emit, 'rascal:PublicationSession');

  this.abort = function () {
    aborted = true;
  };

  this.isAborted = function () {
    return aborted;
  };

  this._removePausedListener = function () {
    vhost.removeListener('paused', emitPaused);
  };

  this._startPublish = function () {
    this.started = Date.now();
  };

  this._endPublish = function () {
    this.stats.duration = Date.now() - this.started;
  };

  function emitPaused() {
    self.emit('paused', messageId);
  }

  vhost.on('paused', emitPaused);

  self.on('newListener', (event) => {
    if (event !== 'paused') return;
    if (vhost.isPaused()) emitPaused();
  });
}
