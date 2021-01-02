var assert = require('assert');
var async = require('async');
var inMemory = require('../../lib/counters/inMemory');

describe('In Memory Counter', function() {

  var counter;

  beforeEach(function() {
    counter = inMemory({ size: 3 });
  });

  it('should return increment and get entries', function(test, done) {
    var results = {};
    async.eachSeries(['one', 'two', 'one'], function(key, cb) {
      counter.incrementAndGet(key, function(err, value) {
        if (err) return cb(err);
        results[key] = value;
        cb();
      });
    }, function(err) {
      assert.ifError(err);
      assert.equal(results.one, 2);
      assert.equal(results.two, 1);
      done();
    });
  });

  it('should limit the counter size', function(test, done) {
    var results = {};
    async.eachSeries(['one', 'two', 'three', 'four', 'one'], function(key, cb) {
      counter.incrementAndGet(key, function(err, value) {
        if (err) return cb(err);
        results[key] = value;
        cb();
      });
    }, function(err) {
      assert.ifError(err);
      assert.equal(results.one, 1);
      done();
    });
  });
});
