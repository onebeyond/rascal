const assert = require('assert');
const exponential = require('../../lib/backoff/exponential');

describe('Exponential Backoff', function() {

  it('should backoff by 1 seconds by default', function() {
    const backoff = exponential({ randomise: false });
    assert.equal(backoff.next(), 1000);
    assert.equal(backoff.next(), 2000);
    assert.equal(backoff.next(), 4000);
  });

  it('should backoff by the specified value', function() {
    const backoff = exponential({ min: 2000, factor: 3, randomise: false });
    assert.equal(backoff.next(), 2000);
    assert.equal(backoff.next(), 6000);
    assert.equal(backoff.next(), 18000);
  });

  it('should backoff between the specified values', function() {
    const backoff = exponential({ min: 2000, factor: 3, randomise: true });
    const results = [];
    for (let i = 0; i < 10; i++) {
      const value = backoff.next();
      if (results.indexOf(value) < 0) results.push(value);
    }
    assert(results[0] >= 2000 && results[0] <= 6000, results[0]);
    assert(results[1] >= 6000 && results[1] <= 18000, results[1]);
    assert(results[2] >= 18000 && results[2] <= 54000, results[2]);
    assert(results[3] >= 54000 && results[3] <= 162000, results[3]);
    assert(results[4] >= 162000 && results[4] <= 486000, results[4]);
    assert(results[5] >= 486000 && results[5] <= 1458000, results[5]);
    assert(results[6] >= 1458000 && results[6] <= 4374000, results[6]);
  });

  it('should cap values', function() {
    const backoff = exponential({ min: 2000, factor: 3, randomise: true, max: 18000 });
    const results = [];
    for (let i = 0; i < 700; i++) {
      const value = backoff.next();
      results.push(value);
    }
    assert(results[0] >= 2000 && results[0] <= 6000, results[0]);
    assert(results[1] >= 6000 && results[1] <= 18000, results[1]);
    for (i = 2; i < 700; i++) {
      assert(results[i] === 18000, results[i]);
    }
  });

  it('should reset values', function() {
    const backoff = exponential({ min: 2000, factor: 3, randomise: true, max: 16000 });
    const results = [];
    for (let i = 0; i < 10; i++) {
      const value = backoff.next();
      if (results.indexOf(value) < 0) results.push(value);
    }
    backoff.reset();
    assert(results[0] >= 2000 && results[0] <= 6000, backoff.next());
  });

});
