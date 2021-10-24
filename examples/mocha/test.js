var assert = require('assert');
var Rascal = require('../..');
var config = require('./config.js');

describe('Example rascal test', function () {
  var broker;

  before(function (done) {
    config.vhosts['/'].publications.test_pub = { exchange: 'demo_ex' };
    Rascal.Broker.create(Rascal.withTestConfig(config), function (err, _broker) {
      if (err) return done(err);
      broker = _broker;
      done();
    });
  });

  beforeEach(function (done) {
    broker.purge(done);
  });

  after(function (done) {
    if (!broker) return done();
    broker.nuke(done);
  });

  it('should demonstrate tests', function (done) {
    broker.subscribe('demo_sub', function (err, subscription) {
      assert.ifError(err);
      subscription.on('message', function (message, content, ackOrNack) {
        subscription.cancel();
        ackOrNack();
        done();
      });
    });

    broker.publish('test_pub', 'Hello Test', 'a.b.c', function (err, publication) {
      assert.ifError(err);
    });
  });
});
