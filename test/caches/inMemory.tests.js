const assert = require('assert');
const async = require('async');
const inMemory = require('../../lib/counters/inMemory');

describe('In Memory Counter', () => {

  let counter;

  beforeEach(() => {
    counter = inMemory({ size: 3 });
  });

  it('should return increment and get entries', (test, done) => {
    const results = {};
    async.eachSeries(['one', 'two', 'one'], (key, cb) => {
      counter.incrementAndGet(key, (err, value) => {
        if (err) return cb(err);
        results[key] = value;
        cb();
      });
    }, (err) => {
      assert.ifError(err);
      assert.strictEqual(results.one, 2);
      assert.strictEqual(results.two, 1);
      done();
    });
  });

  it('should limit the counter size', (test, done) => {
    const results = {};
    async.eachSeries(['one', 'two', 'three', 'four', 'one'], (key, cb) => {
      counter.incrementAndGet(key, (err, value) => {
        if (err) return cb(err);
        results[key] = value;
        cb();
      });
    }, (err) => {
      assert.ifError(err);
      assert.strictEqual(results.one, 1);
      done();
    });
  });
});
