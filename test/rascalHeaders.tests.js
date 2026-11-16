const assert = require('assert');
const _ = require('lodash');
const { sanitise } = require('../lib/amqp/RascalHeaders');

describe('Rascal Headers', () => {
  it('should add a rascal header when there is none', () => {
    const headers = { foo: 'bar' };
    sanitise(headers, 'q1');
    assert.deepStrictEqual(headers, { foo: 'bar', rascal: {} });
  });

  it('should keep a well formed rascal header', () => {
    const headers = {
      rascal: {
        originalQueue: 'q1',
        originalVhost: '/',
        originalExchange: 'e1',
        originalRoutingKey: 'foo',
        restoreRoutingHeaders: true,
        redeliveries: 0,
        error: { message: 'republish me', code: 'red' },
        encryption: { name: 'well-known', iv: 'abcdef', originalContentType: 'text/plain' },
        recovery: {
          q1: {
            republished: 2,
            forwarded: 0,
            immediateNack: true,
            xDeath: {
              count: 1, reason: 'rejected', queue: 'q1', time: { '!': 'timestamp', value: 1700000000 },
            },
          },
          q2: { republished: 1 },
        },
      },
    };
    const expected = _.cloneDeep(headers);
    sanitise(headers, 'q1');
    assert.deepStrictEqual(headers, expected);
  });

  it('should keep a rascal header that has no prototype', () => {
    const rascal = Object.assign(Object.create(null), { restoreRoutingHeaders: true });
    const headers = { rascal };
    sanitise(headers, 'q1');
    assert.strictEqual(headers.rascal, rascal);
    assert.strictEqual(headers.rascal.restoreRoutingHeaders, true);
  });

  const malformedTables = {
    'a number': 10,
    'a string': 'text',
    'a list': [1],
    'a buffer': Buffer.from('text'),
    'a table with a key named !': { '!': 'unknown' },
    'an explicit table': { '!': 'table', value: { '!': 'unknown' } },
  };

  Object.keys(malformedTables).forEach((description) => {
    const malformed = malformedTables[description];

    it(`should replace a rascal header that is ${description}`, () => {
      const headers = { foo: 'bar', rascal: malformed };
      sanitise(headers, 'q1');
      assert.deepStrictEqual(headers, { foo: 'bar', rascal: {} });
    });

    it(`should remove a rascal recovery header that is ${description}`, () => {
      const headers = { rascal: { restoreRoutingHeaders: true, recovery: malformed } };
      sanitise(headers, 'q1');
      assert.deepStrictEqual(headers, { rascal: { restoreRoutingHeaders: true } });
    });

    it(`should remove a rascal recovery header for the queue that is ${description}`, () => {
      const headers = { rascal: { recovery: { q1: malformed, q2: { republished: 1 } } } };
      sanitise(headers, 'q1');
      assert.deepStrictEqual(headers, { rascal: { recovery: { q2: { republished: 1 } } } });
    });

    it(`should remove a rascal error header that is ${description}`, () => {
      const headers = { rascal: { restoreRoutingHeaders: true, error: malformed } };
      sanitise(headers, 'q1');
      assert.deepStrictEqual(headers, { rascal: { restoreRoutingHeaders: true } });
    });
  });

  it('should remove the rascal recovery header for a queue with periods in its name', () => {
    const headers = { rascal: { recovery: { 'q_10.10.10.10': [1] } } };
    sanitise(headers, 'q_10.10.10.10');
    assert.deepStrictEqual(headers, { rascal: { recovery: {} } });
  });

  it('should not remove the rascal recovery header for another queue', () => {
    const headers = { rascal: { recovery: { q2: [1] } } };
    sanitise(headers, 'q1');
    assert.deepStrictEqual(headers, { rascal: { recovery: { q2: [1] } } });
  });

  const malformedCounts = {
    negative: -1,
    'a fraction': 1.5,
    'not a number': NaN,
    infinite: Infinity,
    'a string': '1',
    'a timestamp': { '!': 'timestamp', value: 1 },
  };

  Object.keys(malformedCounts).forEach((description) => {
    const malformed = malformedCounts[description];

    it(`should remove a republished count that is ${description}`, () => {
      const headers = { rascal: { recovery: { q1: { republished: malformed, immediateNack: true } } } };
      sanitise(headers, 'q1');
      assert.deepStrictEqual(headers, { rascal: { recovery: { q1: { immediateNack: true } } } });
    });

    it(`should remove a forwarded count that is ${description}`, () => {
      const headers = { rascal: { recovery: { q1: { forwarded: malformed, immediateNack: true } } } };
      sanitise(headers, 'q1');
      assert.deepStrictEqual(headers, { rascal: { recovery: { q1: { immediateNack: true } } } });
    });
  });

  it('should remove an original routing key that is not a string', () => {
    const headers = { rascal: { restoreRoutingHeaders: true, originalRoutingKey: 10 } };
    sanitise(headers, 'q1');
    assert.deepStrictEqual(headers, { rascal: { restoreRoutingHeaders: true } });
  });

  it('should remove an original exchange that is not a string', () => {
    const headers = { rascal: { restoreRoutingHeaders: true, originalExchange: [1] } };
    sanitise(headers, 'q1');
    assert.deepStrictEqual(headers, { rascal: { restoreRoutingHeaders: true } });
  });
});
