const { describe, it } = require('node:test');
const assert = require('assert');
const { EMPTY_X_DEATH, getCurrentXDeath, getPreviousXDeath } = require('../lib/amqp/XDeath');

describe('XDeath', () => {
  const rejected = {
    count: 2, reason: 'rejected', queue: 'q1', time: { '!': 'timestamp', value: 1700000000 },
  };

  describe('current', () => {
    it('should find the record of the message being rejected from the queue', () => {
      const expired = {
        count: 1, reason: 'expired', queue: 'q1', time: { '!': 'timestamp', value: 1600000000 },
      };
      const elsewhere = {
        count: 1, reason: 'rejected', queue: 'q2', time: { '!': 'timestamp', value: 1600000000 },
      };
      assert.strictEqual(getCurrentXDeath({ 'x-death': [expired, elsewhere, rejected] }, 'q1'), rejected);
    });

    it('should be empty when there is no x-death header', () => {
      assert.strictEqual(getCurrentXDeath({}, 'q1'), EMPTY_X_DEATH);
    });

    it('should be empty when the message was not rejected from the queue', () => {
      assert.strictEqual(getCurrentXDeath({ 'x-death': [rejected] }, 'q2'), EMPTY_X_DEATH);
    });

    it('should be empty when the x-death header is a number', () => {
      assert.strictEqual(getCurrentXDeath({ 'x-death': 10 }, 'q1'), EMPTY_X_DEATH);
    });

    it('should be empty when the x-death header is a string', () => {
      assert.strictEqual(getCurrentXDeath({ 'x-death': 'text' }, 'q1'), EMPTY_X_DEATH);
    });

    it('should be empty when the x-death header is a table', () => {
      assert.strictEqual(getCurrentXDeath({ 'x-death': rejected }, 'q1'), EMPTY_X_DEATH);
    });

    it('should skip x-death records that are not tables', () => {
      assert.strictEqual(getCurrentXDeath({ 'x-death': [null, 10, 'text', rejected] }, 'q1'), rejected);
    });

    it('should be empty when the record has no count', () => {
      const record = { reason: 'rejected', queue: 'q1', time: { '!': 'timestamp', value: 1700000000 } };
      assert.strictEqual(getCurrentXDeath({ 'x-death': [record] }, 'q1'), EMPTY_X_DEATH);
    });

    it('should be empty when the record has no time', () => {
      const record = { count: 2, reason: 'rejected', queue: 'q1' };
      assert.strictEqual(getCurrentXDeath({ 'x-death': [record] }, 'q1'), EMPTY_X_DEATH);
    });

    it('should be empty when the record time is not a timestamp', () => {
      const record = {
        count: 2, reason: 'rejected', queue: 'q1', time: 'yesterday',
      };
      assert.strictEqual(getCurrentXDeath({ 'x-death': [record] }, 'q1'), EMPTY_X_DEATH);
    });
  });

  describe('previous', () => {
    it('should find the record stored when the message was republished from the queue', () => {
      const headers = { rascal: { recovery: { q1: { immediateNack: true, xDeath: rejected } } } };
      assert.strictEqual(getPreviousXDeath(headers, 'q1'), rejected);
    });

    it('should find the record stored for a queue with periods in its name', () => {
      const headers = { rascal: { recovery: { 'q_10.10.10.10': { immediateNack: true, xDeath: rejected } } } };
      assert.strictEqual(getPreviousXDeath(headers, 'q_10.10.10.10'), rejected);
    });

    it('should be empty when no record was stored', () => {
      assert.strictEqual(getPreviousXDeath({ rascal: { recovery: { q1: { immediateNack: true } } } }, 'q1'), EMPTY_X_DEATH);
    });

    it('should be empty when there is no rascal header', () => {
      assert.strictEqual(getPreviousXDeath({}, 'q1'), EMPTY_X_DEATH);
    });

    it('should be empty when the stored record has no count or time', () => {
      assert.strictEqual(getPreviousXDeath({ rascal: { recovery: { q1: { immediateNack: true, xDeath: {} } } } }, 'q1'), EMPTY_X_DEATH);
    });

    it('should be empty when the stored record is not a table', () => {
      assert.strictEqual(getPreviousXDeath({ rascal: { recovery: { q1: { immediateNack: true, xDeath: 10 } } } }, 'q1'), EMPTY_X_DEATH);
    });
  });
});
