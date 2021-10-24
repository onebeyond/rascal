const debug = require('debug')('rascal:SubscriberSession');
const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;

module.exports = PublicationSession;

inherits(PublicationSession, EventEmitter);

function PublicationSession(vhost, messageId) {
  const self = this;
  let aborted = false;

  this.stats = {};

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
