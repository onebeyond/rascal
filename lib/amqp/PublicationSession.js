var debug = require('debug')('rascal:SubscriberSession');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

module.exports = PublicationSession;

inherits(PublicationSession, EventEmitter);

function PublicationSession(vhost, messageId) {

  var self = this;
  var aborted = false;

  this.abort = function() {
    aborted = true;
  };

  this.isAborted = function() {
    return aborted;
  };

  function emitPause() {
    self.emit('paused', messageId);
  }

  vhost.on('paused', function() {
    emitPause();
  });

  self.on('newListener', function(event) {
    if (event !== 'paused') return;
    if (vhost.isPaused()) emitPause();
  });
}
