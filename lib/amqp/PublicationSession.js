var debug = require('debug')('rascal:SubscriberSession');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

module.exports = PublicationSession;

inherits(PublicationSession, EventEmitter);

function PublicationSession(vhost, messageId) {

  var self = this;
  var aborted = false;

  this.stats = {};

  this.abort = function() {
    aborted = true;
  };

  this.isAborted = function() {
    return aborted;
  };

  this._removePausedListener = function() {
    vhost.removeListener('paused',emitPaused);
  };

  this._startPublish = function() {
    this.started = Date.now();
  };

  this._endPublish = function() {
    this.stats.duration = Date.now() - this.started;
  };

  function emitPaused() {
    self.emit('paused', messageId);
  }

  vhost.on('paused', emitPaused);

  self.on('newListener', function(event) {
    if (event !== 'paused') return;
    if (vhost.isPaused()) emitPaused();
  });
}
