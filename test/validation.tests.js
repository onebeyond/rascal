const assert = require('assert');
const validate = require('../lib/config/validate');

describe('Validation', () => {

  describe('Bindings', () => {

    it('should mandate a source', () => {
      validate({
        vhosts: {
          v1: {
            bindings: {
              b1: {
              },
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Binding: b1 in vhost: v1 is missing a source', err.message);
      });
    });

    it('should mandate a destination', () => {
      validate({
        vhosts: {
          v1: {
            bindings: {
              b1: {
                source: 'e1',
              },
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Binding: b1 in vhost: v1 is missing a destination', err.message);
      });
    });

    it('should mandate a destination type', () => {
      validate({
        vhosts: {
          v1: {
            bindings: {
              b1: {
                source: 'e1',
                destination: 'q1',
              },
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Binding: b1 in vhost: v1 is missing a destination type', err.message);
      });
    });

    it('should report invalid destination types', () => {
      validate({
        vhosts: {
          v1: {
            bindings: {
              b1: {
                source: 'e1',
                destination: 'q1',
                destinationType: 'foo',
              },
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Binding: b1 in vhost: v1 has an invalid destination type: foo', err.message);
      });
    });

    it('should report unknown source exchanges (a)', () => {
      validate({
        vhosts: {
          v1: {
            bindings: {
              b1: {
                source: 'e1',
                destination: 'q1',
                destinationType: 'queue',
              },
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Binding: b1 in vhost: v1 refers to an unknown exchange: e1', err.message);
      });
    });

    it('should report unknown source exchanges (b)', () => {
      validate({
        vhosts: {
          v1: {
            exchanges: {
            },
            bindings: {
              b1: {
                source: 'e1',
                destination: 'q1',
                destinationType: 'queue',
              },
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Binding: b1 in vhost: v1 refers to an unknown exchange: e1', err.message);
      });
    });

    it('should report unknown destination exchanges', () => {
      validate({
        vhosts: {
          v1: {
            exchanges: {
              e1: {
              },
            },
            bindings: {
              b1: {
                source: 'e1',
                destination: 'e2',
                destinationType: 'exchange',
              },
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Binding: b1 in vhost: v1 refers to an unknown exchange: e2', err.message);
      });
    });

    it('should report unknown destination queues (a)', () => {
      validate({
        vhosts: {
          v1: {
            exchanges: {
              e1: {
              },
            },
            bindings: {
              b1: {
                source: 'e1',
                destination: 'q1',
                destinationType: 'queue',
              },
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Binding: b1 in vhost: v1 refers to an unknown queue: q1', err.message);
      });
    });

    it('should report unknown destination queues (b)', () => {
      validate({
        vhosts: {
          v1: {
            exchanges: {
              e1: {
              },
            },
            queues: {
            },
            bindings: {
              b1: {
                source: 'e1',
                destination: 'q1',
                destinationType: 'queue',
              },
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Binding: b1 in vhost: v1 refers to an unknown queue: q1', err.message);
      });
    });
  });

  describe('Publications', () => {

    it('should mandate a vhost', () => {
      validate({
        publications: {
          p1: {
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Publication: p1 is missing a vhost', err.message);
      });
    });

    it('should mandate either an exchange or a queue (a)', () => {
      validate({
        publications: {
          p1: {
            vhost: 'v1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Publication: p1 is missing an exchange or a queue', err.message);
      });
    });

    it('should mandate either an exchange or a queue (b)', () => {
      validate({
        publications: {
          p1: {
            vhost: 'v1',
            exchange: 'e1',
            queue: 'q1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Publication: p1 has an exchange and a queue', err.message);
      });
    });

    it('should mandate either an exchange or a queue (c)', () => {
      validate({
        publications: {
          p1: {
            vhost: 'v1',
            exchange: '', // default exchange
            queue: 'q1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Publication: p1 has an exchange and a queue', err.message);
      });
    });

    it('should report unknown vhosts (a)', () => {
      validate({
        publications: {
          p1: {
            vhost: 'v1',
            exchange: 'e1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Publication: p1 refers to an unknown vhost: v1', err.message);
      });
    });

    it('should report unknown vhosts (b)', () => {
      validate({
        vhosts: {
        },
        publications: {
          p1: {
            vhost: 'v1',
            exchange: 'e1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Publication: p1 refers to an unknown vhost: v1', err.message);
      });
    });

    it('should report unknown exchanges (a)', () => {
      validate({
        vhosts: {
          v1: {
          },
        },
        publications: {
          p1: {
            vhost: 'v1',
            exchange: 'e1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Publication: p1 refers to an unknown exchange: e1 in vhost: v1', err.message);
      });
    });

    it('should report unknown exchanges (b)', () => {
      validate({
        vhosts: {
          v1: {
            exchanges: {
            },
          },
        },
        publications: {
          p1: {
            vhost: 'v1',
            exchange: 'e1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Publication: p1 refers to an unknown exchange: e1 in vhost: v1', err.message);
      });
    });

    it('should report unknown queues (a)', () => {
      validate({
        vhosts: {
          v1: {
          },
        },
        publications: {
          p1: {
            vhost: 'v1',
            queue: 'q1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Publication: p1 refers to an unknown queue: q1 in vhost: v1', err.message);
      });
    });

    it('should report unknown queues (b)', () => {
      validate({
        vhosts: {
          v1: {
            queues: {
            },
          },
        },
        publications: {
          p1: {
            vhost: 'v1',
            queue: 'q1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Publication: p1 refers to an unknown queue: q1 in vhost: v1', err.message);
      });
    });
  });

  describe('Subscriptions', () => {

    it('should mandate a vhost', () => {
      validate({
        subscriptions: {
          s1: {
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Subscription: s1 is missing a vhost', err.message);
      });
    });

    it('should mandate a queue', () => {
      validate({
        subscriptions: {
          s1: {
            vhost: 'v1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Subscription: s1 is missing a queue', err.message);
      });
    });

    it('should report unknown vhosts (a)', () => {
      validate({
        subscriptions: {
          s1: {
            vhost: 'v1',
            queue: 'q1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Subscription: s1 refers to an unknown vhost: v1', err.message);
      });
    });

    it('should report unknown vhosts (b)', () => {
      validate({
        vhosts: {
        },
        subscriptions: {
          s1: {
            vhost: 'v1',
            queue: 'q1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Subscription: s1 refers to an unknown vhost: v1', err.message);
      });
    });

    it('should report unknown queues (a)', () => {
      validate({
        vhosts: {
          v1: {
          },
        },
        subscriptions: {
          s1: {
            vhost: 'v1',
            queue: 'q1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Subscription: s1 refers to an unknown queue: q1 in vhost: v1', err.message);
      });
    });

    it('should report unknown queues (b)', () => {
      validate({
        vhosts: {
          v1: {
            queues: {
            },
          },
        },
        subscriptions: {
          s1: {
            vhost: 'v1',
            queue: 'q1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Subscription: s1 refers to an unknown queue: q1 in vhost: v1', err.message);
      });
    });

    it('should report unknown counters', () => {
      validate({
        vhosts: {
          v1: {
            queues: {
              q1: {},
            },
          },
        },
        subscriptions: {
          s1: {
            vhost: 'v1',
            queue: 'q1',
            redeliveries: {
              counter: 'c1',
            },
          },
        },
        redeliveries: {
          counters: {},
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Subscription: s1 refers to an unknown counter: c1 in vhost: v1', err.message);
      });
    });
  });

  describe('Shovels', () => {

    it('should mandate a subscription', () => {
      validate({
        shovels: {
          x1: {
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Shovel: x1 is missing a subscription', err.message);
      });
    });

    it('should mandate a publication', () => {
      validate({
        shovels: {
          x1: {
            subscription: 's1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Shovel: x1 is missing a publication', err.message);
      });
    });

    it('should report unknown subscriptions', () => {
      validate({
        subscriptions: {
        },
        publications: {
        },
        shovels: {
          x1: {
            subscription: 's1',
            publication: 'p1',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Shovel: x1 refers to an unknown subscription: s1', err.message);
      });
    });

    it('should report unknown publications', () => {
      validate({
        vhosts: {
          v1: {
            queues: {
              q1: {
              },
            },
          },
        },
        subscriptions: {
          s1: {
            vhost: 'v1',
            queue: 'q1',
            redeliveries: {
              counter: 'c1',
            },
          },
        },
        publications: {
        },
        shovels: {
          x1: {
            subscription: 's1',
            publication: 'p1',
          },
        },
        redeliveries: {
          counters: {
            c1: {},
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Shovel: x1 refers to an unknown publication: p1', err.message);
      });
    });
  });

  describe('Vocabulary', () => {

    it('should report invalid vhost attribute', () => {
      validate({
        vhosts: {
          v1: {
            invalid: true,
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Vhost: v1 refers to an unsupported attribute: invalid', err.message);
      });
    });

    it('should report invalid publication channel pool attributes', () => {
      validate({
        vhosts: {
          v1: {
            publicationChannelPools: {
              invalid: true,
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Publication channel pool in vhost: v1 refers to an unsupported attribute: invalid', err.message);
      });
    });

    it('should report invalid connection strategies', () => {
      validate({
        vhosts: {
          v1: {
            connectionStrategy: 'meh',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Vhost: v1 refers to an unknown connection strategy: meh', err.message);
      });
    });

    it('should report invalid connection attributes', () => {
      validate({
        vhosts: {
          v1: {
            connection: {
              invalid: true,
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Vhost: v1 connection refers to an unsupported attribute: invalid', err.message);
      });
    });

    it('should report invalid exchange attributes', () => {
      validate({
        vhosts: {
          v1: {
            exchanges: {
              e1: {
                invalid: true,
              },
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Exchange: e1 in vhost: v1 refers to an unsupported attribute: invalid', err.message);
      });
    });

    it('should report invalid queues attributes', () => {
      validate({
        vhosts: {
          v1: {
            queues: {
              q1: {
                invalid: true,
              },
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Queue: q1 in vhost: v1 refers to an unsupported attribute: invalid', err.message);
      });
    });

    it('should report invalid binding attributes', () => {
      validate({
        vhosts: {
          v1: {
            bindings: {
              b1: {
                invalid: true,
              },
            },
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Binding: b1 in vhost: v1 refers to an unsupported attribute: invalid', err.message);
      });
    });

    it('should report invalid publication attributes', () => {
      validate({
        publications: {
          p1: {
            invalid: true,
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Publication: p1 refers to an unsupported attribute: invalid', err.message);
      });
    });

    it('should report invalid subscription attributes', () => {
      validate({
        subscriptions: {
          s1: {
            invalid: true,
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Subscription: s1 refers to an unsupported attribute: invalid', err.message);
      });
    });

    it('should report invalid shovel attributes', () => {
      validate({
        shovels: {
          x1: {
            invalid: true,
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Shovel: x1 refers to an unsupported attribute: invalid', err.message);
      });
    });
  });

  describe('Encryption', () => {

    it('should mandate a key', () => {
      validate({
        encryption: {
          'invalid': {
            name: 'name',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Encryption profile: invalid is missing a key', err.message);
      });
    });

    it('should mandate an algorithm', () => {
      validate({
        encryption: {
          'invalid': {
            name: 'name',
            key: 'key',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Encryption profile: invalid is missing an algorithm', err.message);
      });
    });

    it('should mandate iv ivLength', () => {
      validate({
        encryption: {
          'invalid': {
            name: 'name',
            key: 'key',
            algorithm: 'rot13',
          },
        },
      }, (err) => {
        assert.ok(err);
        assert.strictEqual('Encryption profile: invalid is missing ivLength', err.message);
      });
    });
  });

});
