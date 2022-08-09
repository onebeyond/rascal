const assert = require('assert');
const format = require('util').format;
const _ = require('lodash');
const url = require('url');
const configure = require('../lib/config/configure');

describe('Configuration', () => {
  describe('Vhosts', () => {
    describe('Connection', () => {
      it('should configure the connection from an object', () => {
        configure(
          {
            vhosts: {
              v1: {
                connection: {
                  slashes: true,
                  protocol: 'protocol',
                  hostname: 'hostname',
                  port: 9000,
                  vhost: 'vhost',
                  user: 'user',
                  password: 'password',
                  options: {
                    heartbeat: 10,
                    channelMax: 100,
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.connections[0].url, 'protocol://user:password@hostname:9000/vhost?heartbeat=10&channelMax=100');
          }
        );
      });

      it('should configure the connection from a string', () => {
        configure(
          {
            vhosts: {
              v1: {
                connection: 'amqp://localhost',
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.connections[0].url, 'amqp://localhost');
          }
        );
      });

      it('should ignore other connection properties when a url is specified', () => {
        configure(
          {
            vhosts: {
              v1: {
                connection: {
                  url: 'foo',
                  slashes: true,
                  protocol: 'protocol',
                  hostname: 'hostname',
                  port: 9000,
                  vhost: 'vhost',
                  user: 'user',
                  password: 'password',
                  options: {
                    heartbeat: 10,
                    channelMax: 100,
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.connections[0].url, 'foo');
          }
        );
      });

      it('should decorate the connection config for a vhost if not explicitly specified', () => {
        configure(
          {
            vhosts: {
              v1: {
                connection: {
                  slashes: true,
                  protocol: 'protocol',
                  hostname: 'hostname',
                  port: 9000,
                  user: 'user',
                  password: 'password',
                  options: {
                    heartbeat: 10,
                    channelMax: 100,
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.connections[0].loggableUrl, 'protocol://user:***@hostname:9000/v1?heartbeat=10&channelMax=100');
          }
        );
      });

      it('should set the pathname to empty string if the vhost is /', () => {
        configure(
          {
            vhosts: {
              '/': {
                connection: {
                  slashes: true,
                  protocol: 'protocol',
                  hostname: 'hostname',
                  port: 9000,
                  user: 'user',
                  password: 'password',
                  options: {
                    heartbeat: 10,
                    channelMax: 100,
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts['/'].connections[0].loggableUrl, 'protocol://user:***@hostname:9000?heartbeat=10&channelMax=100');
          }
        );
      });

      it('should decorate the connection config with a loggable url (a)', () => {
        configure(
          {
            vhosts: {
              v1: {
                connection: {
                  slashes: true,
                  protocol: 'protocol',
                  hostname: 'hostname',
                  port: 9000,
                  vhost: 'vhost',
                  user: 'user',
                  password: 'password',
                  options: {
                    heartbeat: 10,
                    channelMax: 100,
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.connections[0].loggableUrl, 'protocol://user:***@hostname:9000/vhost?heartbeat=10&channelMax=100');
          }
        );
      });

      it('should fully obscure the password in a loggable url (a)', () => {
        configure(
          {
            vhosts: {
              v1: {
                connection: 'amqp://user:badp@assword@hostname:9000/vhost?heartbeat=10&channelMax=100',
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.connections[0].loggableUrl, 'amqp://user:***@hostname:9000/vhost?heartbeat=10&channelMax=100');
          }
        );
      });

      it('should generate connections from an array', () => {
        configure(
          {
            vhosts: {
              v1: {
                connections: [
                  {
                    url: 'protocol://user:password@alpha:9000/vhost?heartbeat=10&channelMax=100',
                  },
                  {
                    slashes: true,
                    protocol: 'protocol',
                    hostname: 'beta',
                    port: 9000,
                    vhost: 'vhost',
                    user: 'user',
                    password: 'password',
                    options: {
                      heartbeat: 10,
                      channelMax: 100,
                    },
                  },
                ],
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            const connections = _.sortBy(config.vhosts.v1.connections, 'url');
            assert.strictEqual(connections[0].url, 'protocol://user:password@alpha:9000/vhost?heartbeat=10&channelMax=100');
            assert.strictEqual(connections[1].url, 'protocol://user:password@beta:9000/vhost?heartbeat=10&channelMax=100');
          }
        );
      });

      it('should randomise the order of connections, but maintain order across vhosts by host', () => {
        const results = [];
        for (let i = 0; i < 10; i++) {
          configure(
            {
              vhosts: {
                v1: {
                  connections: [
                    {
                      url: 'protocol://user:password@alpha:9000/v1?heartbeat=10&channelMax=100',
                    },
                    {
                      url: 'protocol://user:password@alpha:9001/v1?heartbeat=10&channelMax=100',
                    },
                    {
                      slashes: true,
                      protocol: 'protocol',
                      hostname: 'beta',
                      port: 9000,
                      vhost: 'v1',
                      user: 'user',
                      password: 'password',
                      options: {
                        heartbeat: 10,
                        channelMax: 100,
                      },
                    },
                    {
                      url: 'protocol://user:password@zeta:9000/v1?heartbeat=10&channelMax=100',
                    },
                  ],
                },
                v2: {
                  connections: [
                    {
                      url: 'protocol://user:password@alpha:9000/v2?heartbeat=10&channelMax=100',
                    },
                    {
                      url: 'protocol://user:password@alpha:9001/v2?heartbeat=10&channelMax=100',
                    },
                    {
                      slashes: true,
                      protocol: 'protocol',
                      hostname: 'beta',
                      port: 9000,
                      vhost: 'v2',
                      user: 'user',
                      password: 'password',
                      options: {
                        heartbeat: 10,
                        channelMax: 100,
                      },
                    },
                    {
                      url: 'protocol://user:password@zeta:9000/v2?heartbeat=10&channelMax=100',
                    },
                  ],
                },
                v3: {
                  connections: [
                    {
                      url: 'protocol://user:password@alpha:9000/v3?heartbeat=10&channelMax=100',
                    },
                    {
                      url: 'protocol://user:password@alpha:9001/v3?heartbeat=10&channelMax=100',
                    },
                    {
                      slashes: true,
                      protocol: 'protocol',
                      hostname: 'beta',
                      port: 9000,
                      vhost: 'v3',
                      user: 'user',
                      password: 'password',
                      options: {
                        heartbeat: 10,
                        channelMax: 100,
                      },
                    },
                    {
                      url: 'protocol://user:password@zeta:9000/v3?heartbeat=10&channelMax=100',
                    },
                  ],
                },
              },
            },
            (err, config) => {
              assert.ifError(err);
              assert.strictEqual(url.parse(config.vhosts.v1.connections[0].url).host, url.parse(config.vhosts.v2.connections[0].url).host);
              assert.strictEqual(url.parse(config.vhosts.v1.connections[0].url).host, url.parse(config.vhosts.v3.connections[0].url).host);
              assert.strictEqual(url.parse(config.vhosts.v1.connections[1].url).host, url.parse(config.vhosts.v2.connections[1].url).host);
              assert.strictEqual(url.parse(config.vhosts.v1.connections[1].url).host, url.parse(config.vhosts.v3.connections[1].url).host);
              assert.strictEqual(url.parse(config.vhosts.v1.connections[2].url).host, url.parse(config.vhosts.v2.connections[2].url).host);
              assert.strictEqual(url.parse(config.vhosts.v1.connections[2].url).host, url.parse(config.vhosts.v3.connections[2].url).host);
              assert.strictEqual(url.parse(config.vhosts.v1.connections[3].url).host, url.parse(config.vhosts.v2.connections[3].url).host);
              assert.strictEqual(url.parse(config.vhosts.v1.connections[3].url).host, url.parse(config.vhosts.v3.connections[3].url).host);

              results.push(
                _.map(config.vhosts.v1.connections, (connection) => {
                  return url.parse(connection.url).host;
                }).join(',')
              );
            }
          );
        }
        assert.ok(_.uniq(results).length > 1);
      });

      it('should honour the order of connections with fixed connection strategy', () => {
        configure(
          {
            vhosts: {
              v1: {
                connectionStrategy: 'fixed',
                connections: [
                  {
                    url: 'protocol://user:password@alpha:9000/v1?heartbeat=10&channelMax=100',
                  },
                  {
                    url: 'protocol://user:password@alpha:9001/v1?heartbeat=10&channelMax=100',
                  },
                  {
                    slashes: true,
                    protocol: 'protocol',
                    hostname: 'beta',
                    port: 9000,
                    vhost: 'v1',
                    user: 'user',
                    password: 'password',
                    options: {
                      heartbeat: 10,
                      channelMax: 100,
                    },
                  },
                  {
                    url: 'protocol://user:password@zeta:9000/v1?heartbeat=10&channelMax=100',
                  },
                ],
              },
              v2: {
                connectionStrategy: 'fixed',
                connections: [
                  {
                    url: 'protocol://user:password@alpha:9001/v2?heartbeat=10&channelMax=100',
                  },
                  {
                    url: 'protocol://user:password@alpha:9000/v2?heartbeat=10&channelMax=100',
                  },
                  {
                    url: 'protocol://user:password@zeta:9000/v2?heartbeat=10&channelMax=100',
                  },
                  {
                    slashes: true,
                    protocol: 'protocol',
                    hostname: 'beta',
                    port: 9000,
                    vhost: 'v2',
                    user: 'user',
                    password: 'password',
                    options: {
                      heartbeat: 10,
                      channelMax: 100,
                    },
                  },
                ],
              },
              v3: {
                connectionStrategy: 'fixed',
                connections: [
                  {
                    url: 'protocol://user:password@alpha:9000/v3?heartbeat=10&channelMax=100',
                  },
                  {
                    url: 'protocol://user:password@alpha:9001/v3?heartbeat=10&channelMax=100',
                  },
                  {
                    slashes: true,
                    protocol: 'protocol',
                    hostname: 'beta',
                    port: 9000,
                    vhost: 'v3',
                    user: 'user',
                    password: 'password',
                    options: {
                      heartbeat: 10,
                      channelMax: 100,
                    },
                  },
                  {
                    url: 'protocol://user:password@zeta:9000/v3?heartbeat=10&channelMax=100',
                  },
                ],
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(url.parse(config.vhosts.v1.connections[0].url).host, 'alpha:9000');
            assert.strictEqual(url.parse(config.vhosts.v1.connections[1].url).host, 'alpha:9001');
            assert.strictEqual(url.parse(config.vhosts.v1.connections[2].url).host, 'beta:9000');
            assert.strictEqual(url.parse(config.vhosts.v1.connections[3].url).host, 'zeta:9000');

            assert.strictEqual(url.parse(config.vhosts.v2.connections[0].url).host, 'alpha:9001');
            assert.strictEqual(url.parse(config.vhosts.v2.connections[1].url).host, 'alpha:9000');
            assert.strictEqual(url.parse(config.vhosts.v2.connections[2].url).host, 'zeta:9000');
            assert.strictEqual(url.parse(config.vhosts.v2.connections[3].url).host, 'beta:9000');

            assert.strictEqual(url.parse(config.vhosts.v3.connections[0].url).host, 'alpha:9000');
            assert.strictEqual(url.parse(config.vhosts.v3.connections[1].url).host, 'alpha:9001');
            assert.strictEqual(url.parse(config.vhosts.v3.connections[2].url).host, 'beta:9000');
            assert.strictEqual(url.parse(config.vhosts.v3.connections[3].url).host, 'zeta:9000');
          }
        );
      });

      it('should decorate the connection config with a loggable url (b)', () => {
        configure(
          {
            vhosts: {
              v1: {
                connection: {
                  url: 'protocol://user:password@hostname:9000/vhost?heartbeat=10&channelMax=100',
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.connections[0].loggableUrl, 'protocol://user:***@hostname:9000/vhost?heartbeat=10&channelMax=100');
          }
        );
      });

      it('should configure the management connection from an object', () => {
        configure(
          {
            vhosts: {
              v1: {
                connection: {
                  slashes: true,
                  protocol: 'protocol',
                  hostname: 'hostname',
                  port: 9000,
                  vhost: 'vhost',
                  user: 'user',
                  password: 'password',
                  management: {
                    protocol: 'https',
                    user: 'admin',
                    password: 'adminpassword',
                    port: 9999,
                    options: {
                      timeout: 555,
                    },
                  },
                  options: {
                    heartbeat: 10,
                    channelMax: 100,
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.connections[0].management.url, 'https://admin:adminpassword@hostname:9999');
          }
        );
      });

      it('should configure the management connection with connection credentials', () => {
        configure(
          {
            vhosts: {
              v1: {
                connection: {
                  slashes: true,
                  protocol: 'protocol',
                  hostname: 'hostname',
                  port: 9000,
                  vhost: 'vhost',
                  user: 'user',
                  password: 'password',
                  management: {
                    protocol: 'https',
                    port: 9999,
                    options: {
                      timeout: 444,
                    },
                  },
                  options: {
                    heartbeat: 10,
                    channelMax: 100,
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.connections[0].management.url, 'https://user:password@hostname:9999');
          }
        );
      });

      it('should generate a namespace when specified', () => {
        configure(
          {
            vhosts: {
              v1: {
                namespace: true,
              },
              v2: {
                namespace: true,
              },
            },
          },
          (err, config) => {
            assert.ifError(err);

            assert.ok(/\w+-\w+-\w+-\w+-\w+/.test(config.vhosts.v1.namespace), format('%s failed to match expected pattern', config.vhosts.v1.namespace));
            assert.ok(/\w+-\w+-\w+-\w+-\w+/.test(config.vhosts.v2.namespace), format('%s failed to match expected pattern', config.vhosts.v1.namespace));
            assert.ok(config.vhosts.v1.namespace !== config.vhosts.v2.namespace);
          }
        );
      });
    });

    describe('Exchanges', () => {
      it('should configure exchanges', () => {
        configure(
          {
            vhosts: {
              v1: {
                exchanges: {
                  e1: {
                    assert: false,
                    type: 'direct',
                    options: {
                      durable: false,
                    },
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.exchanges.e1.assert, false);
            assert.strictEqual(config.vhosts.v1.exchanges.e1.type, 'direct');
            assert.strictEqual(config.vhosts.v1.exchanges.e1.options.durable, false);
          }
        );
      });

      it('should add default exchange by default', () => {
        configure(
          {
            vhosts: {
              v1: {
                exchanges: {
                  e1: {
                    assert: false,
                    type: 'direct',
                    options: {
                      durable: false,
                    },
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.exchanges[''].name, '');
          }
        );
      });

      it('should not overwrite existing default exchange', () => {
        configure(
          {
            vhosts: {
              v1: {
                exchanges: {
                  '': {
                    type: 'not-overwritten',
                  },
                  e1: {
                    assert: false,
                    type: 'direct',
                    options: {
                      durable: false,
                    },
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.exchanges[''].type, 'not-overwritten');
          }
        );
      });

      it('should inflate exchanges with empty structure', () => {
        configure(
          {
            vhosts: {
              v1: {
                exchanges: {
                  e1: {},
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert(_.isObject(config.vhosts.v1.exchanges.e1.options));
          }
        );
      });

      it('should decorate exchanges with name and fully qualified name', () => {
        configure(
          {
            vhosts: {
              v1: {
                exchanges: {
                  e1: {},
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.exchanges.e1.name, 'e1');
            assert.strictEqual(config.vhosts.v1.exchanges.e1.fullyQualifiedName, 'e1');
          }
        );
      });

      it('should prefix fully qualified name with specified namespace', () => {
        configure(
          {
            vhosts: {
              v1: {
                namespace: 'foo',
                exchanges: {
                  e1: {},
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.exchanges.e1.name, 'e1');
            assert.strictEqual(config.vhosts.v1.exchanges.e1.fullyQualifiedName, 'foo:e1');
          }
        );
      });

      it('should support array of names configuration', () => {
        configure(
          {
            vhosts: {
              v1: {
                exchanges: ['e1', 'e2'],
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.ok(!_.isArray(config.vhosts.v1.exchanges));
            assert.strictEqual(config.vhosts.v1.exchanges.e1.name, 'e1');
            assert.strictEqual(config.vhosts.v1.exchanges.e1.fullyQualifiedName, 'e1');

            assert.strictEqual(config.vhosts.v1.exchanges.e2.name, 'e2');
            assert.strictEqual(config.vhosts.v1.exchanges.e2.fullyQualifiedName, 'e2');
          }
        );
      });

      it('should support a mixed array of names / objects configuration', () => {
        configure(
          {
            vhosts: {
              v1: {
                exchanges: ['e1', { name: 'e2' }],
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.ok(!_.isArray(config.vhosts.v1.exchanges));
            assert.strictEqual(config.vhosts.v1.exchanges.e1.name, 'e1');
            assert.strictEqual(config.vhosts.v1.exchanges.e1.fullyQualifiedName, 'e1');

            assert.strictEqual(config.vhosts.v1.exchanges.e2.name, 'e2');
            assert.strictEqual(config.vhosts.v1.exchanges.e2.fullyQualifiedName, 'e2');
          }
        );
      });
    });

    describe('Queues', () => {
      it('should configure queues', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: {
                  q1: {
                    assert: false,
                    type: 'direct',
                    options: {
                      durable: false,
                    },
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.queues.q1.assert, false);
            assert.strictEqual(config.vhosts.v1.queues.q1.type, 'direct');
            assert.strictEqual(config.vhosts.v1.queues.q1.options.durable, false);
          }
        );
      });

      it('should inflate queues with empty structure', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: {
                  q1: {},
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert(_.isObject(config.vhosts.v1.queues.q1.options));
          }
        );
      });

      it('should decorate queues with name and fully qualified name', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: {
                  q1: {},
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.queues.q1.name, 'q1');
            assert.strictEqual(config.vhosts.v1.queues.q1.fullyQualifiedName, 'q1');
          }
        );
      });

      it('should prefix fully qualified name with specified namespace', () => {
        configure(
          {
            vhosts: {
              v1: {
                namespace: 'foo',
                queues: {
                  q1: {},
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.queues.q1.name, 'q1');
            assert.strictEqual(config.vhosts.v1.queues.q1.fullyQualifiedName, 'foo:q1');
          }
        );
      });

      it('should append uuid to replyTo queues', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: {
                  q1: {
                    replyTo: true,
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.queues.q1.name, 'q1');
            assert.ok(/q1:\w+-\w+-\w+-\w+-\w+/.test(config.vhosts.v1.queues.q1.fullyQualifiedName), format('%s failed to match expected pattern', config.vhosts.v1.queues.q1.fullyQualifiedName));
          }
        );
      });

      it('should prefix dead letter exchange argument with specified namespace', () => {
        configure(
          {
            vhosts: {
              v1: {
                namespace: 'foo',
                queues: {
                  q1: {
                    options: {
                      arguments: {
                        'x-dead-letter-exchange': 'q1',
                      },
                    },
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.queues.q1.name, 'q1');
            assert.strictEqual(config.vhosts.v1.queues.q1.options.arguments['x-dead-letter-exchange'], 'foo:q1');
          }
        );
      });

      it('should support a mixed array of names / objects configuration', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: ['q1', 'q2'],
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.ok(!_.isArray(config.vhosts.v1.queues));
            assert.strictEqual(config.vhosts.v1.queues.q1.name, 'q1');
            assert.strictEqual(config.vhosts.v1.queues.q1.fullyQualifiedName, 'q1');

            assert.strictEqual(config.vhosts.v1.queues.q2.name, 'q2');
            assert.strictEqual(config.vhosts.v1.queues.q2.fullyQualifiedName, 'q2');
          }
        );
      });
    });

    describe('Bindings', () => {
      it('should configure bindings', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: {
                  q1: {},
                },
                bindings: {
                  b1: {
                    source: 'e1',
                    destination: 'q1',
                    bindingKey: '#',
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.bindings.b1.source, 'e1');
            assert.strictEqual(config.vhosts.v1.bindings.b1.destination, 'q1');
            assert.strictEqual(config.vhosts.v1.bindings.b1.bindingKey, '#');
          }
        );
      });

      it('should convert "source -> destination" from binding key', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: {
                  q1: {},
                },
                bindings: {
                  'e1 -> q1': {},
                  'e:1 -> q:1': {},
                  'e_1 -> q_1': {},
                  'e.1 -> q.1': {},
                  'e-1 -> q-1': {},
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.bindings['e1 -> q1'].source, 'e1');
            assert.strictEqual(config.vhosts.v1.bindings['e1 -> q1'].destination, 'q1');
            assert.strictEqual(config.vhosts.v1.bindings['e:1 -> q:1'].source, 'e:1');
            assert.strictEqual(config.vhosts.v1.bindings['e:1 -> q:1'].destination, 'q:1');
            assert.strictEqual(config.vhosts.v1.bindings['e_1 -> q_1'].source, 'e_1');
            assert.strictEqual(config.vhosts.v1.bindings['e_1 -> q_1'].destination, 'q_1');

            assert.strictEqual(config.vhosts.v1.bindings['e.1 -> q.1'].source, 'e.1');
            assert.strictEqual(config.vhosts.v1.bindings['e.1 -> q.1'].destination, 'q.1');

            assert.strictEqual(config.vhosts.v1.bindings['e-1 -> q-1'].source, 'e-1');
            assert.strictEqual(config.vhosts.v1.bindings['e-1 -> q-1'].destination, 'q-1');
          }
        );
      });

      it('should convert "source[binding.key] -> destination" from binding key', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: {
                  q1: {},
                },
                bindings: {
                  'e1[a] -> q1': {},
                  'e1[a.b] -> q1': {},
                  'e1[a,a.b] -> q1': {},
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.bindings['e1[a] -> q1'].bindingKey, 'a');
            assert.strictEqual(config.vhosts.v1.bindings['e1[a.b] -> q1'].bindingKey, 'a.b');
            assert.strictEqual(config.vhosts.v1.bindings['e1[a,a.b] -> q1:a'].bindingKey, 'a');
            assert.strictEqual(config.vhosts.v1.bindings['e1[a,a.b] -> q1:a.b'].bindingKey, 'a.b');
          }
        );
      });

      it('should qualify bindings keys when specified', () => {
        configure(
          {
            vhosts: {
              v1: {
                namespace: 'ns1',
                queues: {
                  q1: {},
                },
                bindings: {
                  b1: {
                    source: 'e1',
                    destination: 'q1',
                    bindingKey: 'q1',
                    qualifyBindingKeys: true,
                  },
                  'e1[q1] -> q1': {
                    qualifyBindingKeys: true,
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.bindings.b1.bindingKey, 'ns1:q1');
            assert.strictEqual(config.vhosts.v1.bindings['e1[q1] -> q1'].bindingKey, 'ns1:q1');
          }
        );
      });

      it('should inflate bindings with empty structure', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: {
                  q1: {},
                },
                bindings: {
                  b1: {
                    destination: 'q1',
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert(_.isObject(config.vhosts.v1.bindings.b1.options));
          }
        );
      });

      it('should decorate bindings with name', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: {
                  q1: {},
                },
                bindings: {
                  b1: {
                    destination: 'q1',
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.bindings.b1.name, 'b1');
          }
        );
      });

      it('should prefix bindingKey with replyTo uuid', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: {
                  q1: {
                    replyTo: true,
                  },
                },
                bindings: {
                  b1: {
                    source: 'e1',
                    destination: 'q1',
                    destinationType: 'queue',
                    bindingKey: 'foo.bar.#',
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.bindings.b1.source, 'e1');
            assert.strictEqual(config.vhosts.v1.bindings.b1.destination, 'q1');
            assert.ok(/\w+-\w+-\w+-\w+-\w+\.foo\.bar\.#/.test(config.vhosts.v1.bindings.b1.bindingKey), format('%s failed to match expected pattern', config.vhosts.v1.bindings.b1.bindingKey));
          }
        );
      });

      it('should configure multiple bindings from an array of binding keys', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: {
                  q1: {},
                },
                bindings: {
                  b1: {
                    source: 'e1',
                    destination: 'q1',
                    bindingKeys: ['a', 'b'],
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.bindings['b1:a'].source, 'e1');
            assert.strictEqual(config.vhosts.v1.bindings['b1:a'].destination, 'q1');
            assert.strictEqual(config.vhosts.v1.bindings['b1:a'].bindingKey, 'a');
            assert.strictEqual(config.vhosts.v1.bindings['b1:b'].source, 'e1');
            assert.strictEqual(config.vhosts.v1.bindings['b1:b'].destination, 'q1');
            assert.strictEqual(config.vhosts.v1.bindings['b1:b'].bindingKey, 'b');
          }
        );
      });

      it('should configure single bindings from an array of binding keys', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: {
                  q1: {},
                },
                bindings: {
                  b1: {
                    source: 'e1',
                    destination: 'q1',
                    bindingKey: ['a'],
                  },
                },
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.strictEqual(config.vhosts.v1.bindings.b1.source, 'e1');
            assert.strictEqual(config.vhosts.v1.bindings.b1.destination, 'q1');
            assert.strictEqual(config.vhosts.v1.bindings.b1.bindingKey, 'a');
          }
        );
      });

      it('should support a mixed array of names / objects configuration', () => {
        configure(
          {
            vhosts: {
              v1: {
                queues: ['q1', 'q2'],
                bindings: ['e1 -> q1', 'e1 -> q2'],
              },
            },
          },
          (err, config) => {
            assert.ifError(err);
            assert.ok(!_.isArray(config.vhosts.v1.bindings));
            assert.strictEqual(config.vhosts.v1.bindings['e1 -> q1'].source, 'e1');
            assert.strictEqual(config.vhosts.v1.bindings['e1 -> q1'].destination, 'q1');

            assert.strictEqual(config.vhosts.v1.bindings['e1 -> q2'].source, 'e1');
            assert.strictEqual(config.vhosts.v1.bindings['e1 -> q2'].destination, 'q2');
          }
        );
      });
    });
  });

  describe('Publications', () => {
    it('should configure exchange publications', () => {
      configure(
        {
          vhosts: {
            v1: {
              exchanges: {
                e1: {},
              },
            },
          },
          publications: {
            p1: {
              vhost: 'v1',
              exchange: 'e1',
              routingKey: 'r1',
              options: {
                persistent: true,
              },
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.publications.p1.vhost, 'v1');
          assert.strictEqual(config.publications.p1.exchange, 'e1');
          assert.strictEqual(config.publications.p1.routingKey, 'r1');
          assert.strictEqual(config.publications.p1.options.persistent, true);
        }
      );
    });

    it('should configure queue publications', () => {
      configure(
        {
          vhosts: {
            v1: {
              queues: {
                q1: {},
              },
            },
          },
          publications: {
            p1: {
              vhost: 'v1',
              queue: 'q1',
              options: {
                persistent: true,
              },
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.publications.p1.vhost, 'v1');
          assert.strictEqual(config.publications.p1.queue, 'q1');
          assert.strictEqual(config.publications.p1.options.persistent, true);
        }
      );
    });

    it('should inflate publications with empty structure', () => {
      configure(
        {
          vhosts: {
            v1: {
              exchanges: {
                e1: {},
              },
            },
          },
          publications: {
            p1: {
              vhost: 'v1',
              exchange: 'e1',
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert(_.isObject(config.publications.p1.options));
        }
      );
    });

    it('should decorate publications with name and destination', () => {
      configure(
        {
          vhosts: {
            v1: {
              exchanges: {
                e1: {},
              },
              queues: {
                q1: {},
              },
            },
          },
          publications: {
            p1: {
              vhost: 'v1',
              exchange: 'e1',
            },
            p2: {
              vhost: 'v1',
              queue: 'q1',
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.publications.p1.name, 'p1');
          assert.strictEqual(config.publications.p1.destination, 'e1');
          assert.strictEqual(config.publications.p2.name, 'p2');
          assert.strictEqual(config.publications.p2.destination, 'q1');
        }
      );
    });

    it('should replace destination its fully qualified names', () => {
      configure(
        {
          vhosts: {
            v1: {
              namespace: 'foo',
              exchanges: {
                e1: {},
              },
              queues: {
                q1: {
                  replyTo: true,
                },
              },
            },
          },
          publications: {
            p1: {
              vhost: 'v1',
              exchange: 'e1',
            },
            p2: {
              vhost: 'v1',
              queue: 'q1',
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.publications.p1.destination, 'foo:e1');
          assert.ok(/foo:q1:\w+-\w+-\w+-\w+-\w+/.test(config.publications.p2.destination), format('%s failed to match expected pattern', config.publications.p2.destination));
        }
      );
    });

    it('should default the publication vhost to the vhost in the surrounding block', () => {
      configure(
        {
          vhosts: {
            v1: {
              exchanges: ['e1'],
              publications: {
                p1: {
                  exchange: 'e1',
                },
              },
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.ok(!config.vhosts.v1.publications);
          assert.strictEqual(config.publications.p1.vhost, 'v1');
          assert.strictEqual(config.publications.p1.destination, 'e1');
        }
      );
    });

    it('should create a default publication for each exchange', () => {
      configure(
        {
          vhosts: {
            '/': {
              exchanges: ['e1'],
            },
            v1: {
              exchanges: ['e1'],
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.ok(!config.vhosts.v1.publications);

          assert.strictEqual(config.publications['/e1'].vhost, '/');
          assert.strictEqual(config.publications['/e1'].destination, 'e1');
          assert.strictEqual(config.publications['/e1'].autoCreated, true);
          assert.strictEqual(config.publications['/e1'].deprecated, undefined);

          assert.strictEqual(config.publications['v1/e1'].vhost, 'v1');
          assert.strictEqual(config.publications['v1/e1'].destination, 'e1');
          assert.strictEqual(config.publications['v1/e1'].autoCreated, true);
          assert.strictEqual(config.publications['v1/e1'].deprecated, undefined);
        }
      );
    });

    it('should not override an explicit vhost publication with a default exchange publication', () => {
      configure(
        {
          vhosts: {
            v1: {
              exchanges: ['e1'],
              publications: {
                e1: {
                  exchange: 'e1',
                  routingKey: 'r1',
                },
              },
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.ok(!config.vhosts.v1.publications);
          assert.strictEqual(config.publications.e1.vhost, 'v1');
          assert.strictEqual(config.publications.e1.destination, 'e1');
          assert.strictEqual(config.publications.e1.routingKey, 'r1');
        }
      );
    });

    it('should not override an explicit root level exchange publication with a default exchange publication', () => {
      configure(
        {
          vhosts: {
            v1: {
              exchanges: ['e1'],
            },
          },
          publications: {
            e1: {
              exchange: 'e1',
              vhost: 'v1',
              routingKey: 'r1',
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.ok(!config.vhosts.v1.publications);
          assert.strictEqual(config.publications.e1.vhost, 'v1');
          assert.strictEqual(config.publications.e1.destination, 'e1');
          assert.strictEqual(config.publications.e1.routingKey, 'r1');
        }
      );
    });

    it('should create a default publication for each queue', () => {
      configure(
        {
          vhosts: {
            '/': {
              queues: ['q1'],
            },
            v1: {
              queues: ['q1'],
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.ok(!config.vhosts.v1.publications);

          assert.strictEqual(config.publications['/q1'].vhost, '/');
          assert.strictEqual(config.publications['/q1'].destination, 'q1');
          assert.strictEqual(config.publications['/q1'].autoCreated, true);
          assert.strictEqual(config.publications['/q1'].deprecated, undefined);

          assert.strictEqual(config.publications['v1/q1'].vhost, 'v1');
          assert.strictEqual(config.publications['v1/q1'].destination, 'q1');
          assert.strictEqual(config.publications['v1/q1'].autoCreated, true);
          assert.strictEqual(config.publications['v1/q1'].deprecated, undefined);
        }
      );
    });

    it('should not override an explicit vhost publication with a default queue publication', () => {
      configure(
        {
          vhosts: {
            v1: {
              queues: ['q1'],
              publications: {
                q1: {
                  queue: 'q1',
                  routingKey: 'r1',
                },
              },
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.ok(!config.vhosts.v1.publications);
          assert.strictEqual(config.publications.q1.vhost, 'v1');
          assert.strictEqual(config.publications.q1.destination, 'q1');
          assert.strictEqual(config.publications.q1.routingKey, 'r1');
        }
      );
    });

    it('should not override an explicit root level publication with a default queue publication', () => {
      configure(
        {
          vhosts: {
            v1: {
              queues: ['q1'],
            },
          },
          publications: {
            q1: {
              queue: 'q1',
              vhost: 'v1',
              routingKey: 'r1',
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.ok(!config.vhosts.v1.publications);
          assert.strictEqual(config.publications.q1.vhost, 'v1');
          assert.strictEqual(config.publications.q1.destination, 'q1');
          assert.strictEqual(config.publications.q1.routingKey, 'r1');
        }
      );
    });

    it('should create a default subscription for each queue', () => {
      configure(
        {
          vhosts: {
            '/': {
              queues: ['q1'],
            },
            v1: {
              queues: ['q1'],
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.ok(!config.vhosts.v1.subscriptions);

          assert.strictEqual(config.subscriptions['/q1'].vhost, '/');
          assert.strictEqual(config.subscriptions['/q1'].source, 'q1');
          assert.strictEqual(config.subscriptions['/q1'].autoCreated, true);
          assert.strictEqual(config.subscriptions['/q1'].deprecated, undefined);

          assert.strictEqual(config.subscriptions['v1/q1'].vhost, 'v1');
          assert.strictEqual(config.subscriptions['v1/q1'].source, 'q1');
          assert.strictEqual(config.subscriptions['v1/q1'].autoCreated, true);
          assert.strictEqual(config.subscriptions['v1/q1'].deprecated, undefined);
        }
      );
    });

    it('should not override an explicit vhost subscription with a default queue subscription', () => {
      configure(
        {
          vhosts: {
            v1: {
              queues: ['q1'],
              subscriptions: {
                q1: {
                  queue: 'q1',
                  routingKey: 'r1',
                },
              },
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.ok(!config.vhosts.v1.subscriptions);
          assert.strictEqual(config.subscriptions.q1.vhost, 'v1');
          assert.strictEqual(config.subscriptions.q1.source, 'q1');
          assert.strictEqual(config.subscriptions.q1.routingKey, 'r1');
        }
      );
    });

    it('should not override and explicit root level subscription with a default queue subscription', () => {
      configure(
        {
          vhosts: {
            v1: {
              queues: ['q1'],
            },
          },
          subscriptions: {
            q1: {
              queue: 'q1',
              vhost: 'v1',
              contentType: 'text/plain',
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.ok(!config.vhosts.v1.subscriptions);
          assert.strictEqual(config.subscriptions.q1.vhost, 'v1');
          assert.strictEqual(config.subscriptions.q1.source, 'q1');
          assert.strictEqual(config.subscriptions.q1.contentType, 'text/plain');
        }
      );
    });

    it('should should merge implicit vhost publications with explicit publications', () => {
      configure(
        {
          vhosts: {
            v1: {
              exchanges: ['e1', 'e2'],
              publications: {
                p1: {
                  exchange: 'e1',
                },
              },
            },
          },
          publications: {
            p2: {
              vhost: 'v1',
              exchange: 'e2',
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.ok(!config.vhosts.v1.publications);
          assert.strictEqual(config.publications.p1.vhost, 'v1');
          assert.strictEqual(config.publications.p1.exchange, 'e1');
          assert.strictEqual(config.publications.p2.vhost, 'v1');
          assert.strictEqual(config.publications.p2.exchange, 'e2');
        }
      );
    });

    it('should hoist referenced encryption profiles', (test, done) => {
      configure(
        {
          vhosts: {
            v1: {
              queues: ['q1'],
              publications: {
                p1: {
                  queue: 'q1',
                  encryption: 'well-known',
                },
              },
            },
          },
          encryption: {
            'well-known': {
              key: 'key',
              ivLength: 16,
              algorithm: 'algo',
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.publications.p1.encryption.name, 'well-known');
          assert.strictEqual(config.publications.p1.encryption.key, 'key');
          assert.strictEqual(config.publications.p1.encryption.ivLength, 16);
          assert.strictEqual(config.publications.p1.encryption.algorithm, 'algo');
          done();
        }
      );
    });
  });

  describe('Subscriptions', () => {
    it('should configure queue subscriptions', () => {
      configure(
        {
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
              confirm: true,
              retry: {
                delay: 1000,
              },
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.subscriptions.s1.vhost, 'v1');
          assert.strictEqual(config.subscriptions.s1.queue, 'q1');
          assert.strictEqual(config.subscriptions.s1.confirm, true);
          assert.strictEqual(config.subscriptions.s1.retry.delay, 1000);
        }
      );
    });

    it('should inflate subscriptions with empty structure', () => {
      configure(
        {
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
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert(_.isObject(config.subscriptions.s1.options));
        }
      );
    });

    it('should decorate subscriptions with name and source', () => {
      configure(
        {
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
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.subscriptions.s1.name, 's1');
          assert.strictEqual(config.subscriptions.s1.source, 'q1');
        }
      );
    });

    it('should report duplicate subscriptions', () => {
      configure(
        {
          vhosts: {
            v1: {
              queues: {
                q1: {},
              },
              subscriptions: {
                s1: {
                  queue: 'q1',
                },
              },
            },
            v2: {
              queues: {
                q1: {},
              },
              subscriptions: {
                s1: {
                  queue: 'q1',
                },
              },
            },
          },
        },
        (err) => {
          assert.strictEqual(err.message, 'Duplicate subscription: s1');
        }
      );
    });

    it('should report duplicate publications', () => {
      configure(
        {
          vhosts: {
            v1: {
              exchanges: {
                e1: {},
              },
              publications: {
                p1: {
                  exchange: 'e1',
                },
              },
            },
            v2: {
              exchanges: {
                e1: {},
              },
              publications: {
                p1: {
                  exchange: 'e1',
                },
              },
            },
          },
        },
        (err) => {
          assert.strictEqual(err.message, 'Duplicate publication: p1');
        }
      );
    });

    it('should replace source with its fully qualified name', () => {
      configure(
        {
          vhosts: {
            v1: {
              namespace: 'foo',
              queues: {
                q1: {
                  replyTo: true,
                },
              },
            },
          },
          subscriptions: {
            s1: {
              vhost: 'v1',
              queue: 'q1',
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.subscriptions.s1.name, 's1');
          assert.ok(/foo:q1:\w+-\w+-\w+-\w+-\w+/.test(config.subscriptions.s1.source), format('%s failed to match expected pattern', config.subscriptions.s1.source));
        }
      );
    });

    it('should default the subscription vhost to the vhost in the surrounding block', () => {
      configure(
        {
          vhosts: {
            v1: {
              queues: ['q1'],
              subscriptions: {
                s1: {
                  queue: 'q1',
                },
              },
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.ok(!config.vhosts.v1.subscriptions);
          assert.strictEqual(config.subscriptions.s1.vhost, 'v1');
          assert.strictEqual(config.subscriptions.s1.queue, 'q1');
        }
      );
    });

    it('should should merge implicit vhost subscriptions with explicit subscriptions', () => {
      configure(
        {
          vhosts: {
            v1: {
              queues: ['q1', 'q2'],
              subscriptions: {
                s1: {
                  queue: 'q1',
                },
              },
            },
          },
          subscriptions: {
            s2: {
              queue: 'q2',
              vhost: 'v1',
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.ok(!config.vhosts.v1.subscriptions);
          assert.strictEqual(config.subscriptions.s1.vhost, 'v1');
          assert.strictEqual(config.subscriptions.s1.queue, 'q1');
          assert.strictEqual(config.subscriptions.s2.vhost, 'v1');
          assert.strictEqual(config.subscriptions.s2.queue, 'q2');
        }
      );
    });

    it('should hoist referenced encryption profiles', (test, done) => {
      configure(
        {
          vhosts: {
            v1: {
              queues: ['q1'],
              subscriptions: {
                s1: {
                  queue: 'q1',
                },
              },
            },
          },
          encryption: {
            'well-known': {
              key: 'key',
              ivLength: 16,
              algorithm: 'algo',
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.subscriptions.s1.encryption['well-known'].key, 'key');
          assert.strictEqual(config.subscriptions.s1.encryption['well-known'].ivLength, 16);
          assert.strictEqual(config.subscriptions.s1.encryption['well-known'].algorithm, 'algo');
          done();
        }
      );
    });
  });

  describe('Shovels', () => {
    it('should decorate subscriptions with name', () => {
      configure(
        {
          shovels: {
            x1: {
              subscription: 's1',
              publication: 'p1',
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.shovels.x1.name, 'x1');
        }
      );
    });

    it('should convert "subscription -> publication" to shovel', () => {
      configure(
        {
          shovels: ['s1 -> p1'],
        },
        (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.shovels['s1 -> p1'].subscription, 's1');
          assert.strictEqual(config.shovels['s1 -> p1'].publication, 'p1');
        }
      );
    });
  });

  describe('Redelivery Counters', () => {
    it('should decorate counter with name and type', () => {
      configure(
        {
          redeliveries: {
            counters: {
              stub: {},
              inMemory: {},
            },
          },
        },
        (err, config) => {
          assert.ifError(err);
          assert.strictEqual(config.redeliveries.counters.stub.name, 'stub');
          assert.strictEqual(config.redeliveries.counters.stub.type, 'stub');
          assert.strictEqual(config.redeliveries.counters.inMemory.name, 'inMemory');
          assert.strictEqual(config.redeliveries.counters.inMemory.type, 'inMemory');
        }
      );
    });
  });
});
