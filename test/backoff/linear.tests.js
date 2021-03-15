const assert = require('assert');
const linear = require('../../lib/backoff/linear');

describe('Linear Backoff', () => {

  it('should backoff by 1 seconds by default', () => {
    const backoff = linear();
    assert.equal(backoff.next(), 1000);
    assert.equal(backoff.next(), 1000);
    assert.equal(backoff.next(), 1000);
  });

  it('should backoff by the specified value', () => {
    const backoff = linear({ min: 2000 });
    assert.equal(backoff.next(), 2000);
    assert.equal(backoff.next(), 2000);
    assert.equal(backoff.next(), 2000);
  });

  it('should backoff by within a range', () => {
    const backoff = linear({ min: 1000, max: 1002 });
    const results = [];
    for (let i = 0; i < 1000; i++) {
      const value = backoff.next();
      if (results.indexOf(value) < 0) results.push(value);
    }
    assert.deepEqual(results.sort(), [1000, 1001, 1002]);
  });

});
