# Rascal

Rascal is a rich pub/sub wrapper around [amqplib](https://www.npmjs.com/package/amqplib).

[![NPM version](https://img.shields.io/npm/v/rascal.svg?style=flat-square)](https://www.npmjs.com/package/rascal)
[![NPM downloads](https://img.shields.io/npm/dm/rascal.svg?style=flat-square)](https://www.npmjs.com/package/rascal)
[![Node.js CI](https://github.com/guidesmiths/rascal/workflows/Node.js%20CI/badge.svg)](https://github.com/guidesmiths/rascal/actions?query=workflow%3A%22Node.js+CI%22)
[![Code Climate](https://codeclimate.com/github/guidesmiths/rascal/badges/gpa.svg)](https://codeclimate.com/github/guidesmiths/rascal)
[![Test Coverage](https://codeclimate.com/github/guidesmiths/rascal/badges/coverage.svg)](https://codeclimate.com/github/guidesmiths/rascal/coverage)
[![Code Style](https://img.shields.io/badge/code%20style-prettier-brightgreen.svg)](https://github.com/prettier/prettier)
[![rascal](https://snyk.io/advisor/npm-package/rascal/badge.svg)](https://snyk.io/advisor/npm-package/rascal)
[![Discover zUnit](https://img.shields.io/badge/Discover-zUnit-brightgreen)](https://www.npmjs.com/package/zunit)

## About

Rascal is a rich pub/sub wrapper for the excellent [amqplib](https://www.npmjs.com/package/amqplib). One of the best things about amqplib is that it doesn't make assumptions about how you use it. Another is that it doesn't attempt to abstract away [AMQP Concepts](https://www.rabbitmq.com/tutorials/amqp-concepts.html). As a result the library offers a great deal of control and flexibility, but the onus is on you adopt appropriate patterns and configuration. You need to be aware that:

- Messages are not persistent by default and will be lost if your broker restarts
- Messages that crash your app will be infinitely retried
- Without prefetch a sudden flood of messages may bust your event loop
- Dropped connections and borked channels will not be automatically recovered
- Any connection or channel errors are emitted as "error" events. Unless you handle them or use [domains](https://nodejs.org/api/domain.html) these will cause your application to crash
- If a message is published using a confirm channel, and the broker fails to acknowledge, the flow of execution may be blocked indefinitely

Rascal seeks to either solve these problems, make them easier to deal with or bring them to your attention by adding the following to [amqplib](https://www.npmjs.com/package/amqplib)

- Config driven vhosts, exchanges, queues, bindings, producers and consumers
- Cluster connection support
- Transparent content parsing
- Transparent encryption / decryption
- Automatic reconnection and resubscription
- Advanced error handling including delayed, limited retries
- Redelivery protection
- Channel pooling
- Flow control
- Publication timeouts
- Safe defaults
- Promise and callback support
- TDD support

## Concepts

Rascal extends the existing [RabbitMQ Concepts](https://www.rabbitmq.com/tutorials/amqp-concepts.html) of Brokers, Vhosts, Exchanges, Queues, Channels and Connections with with two new ones

1. Publications
1. Subscriptions

A **publication** is a named configuration for publishing a message, including the destination queue or exchange, routing configuration, encryption profile and reliability guarantees, message options, etc. A **subscription** is a named configuration for consuming messages, including the source queue, encryption profile, content encoding, delivery options (e.g. acknowledgement handling and prefetch), etc. These must be [configured](#configuration) and supplied when creating the Rascal broker. After the broker has been created the subscriptions and publications can be retrivied from the broker and used to publish and consume messages.

### Breaking Changes in Rascal@14

Rascal@15 waits for inflight messages to be acknowledged before closing subscriber channels. Prior to this version Rascal just waited an arbitary amount of time. If you application does not acknowledge a message for some reason (quite likely in tests) calling `subscription.cancel`, `broker.unsubscribeAll`, `broker.bounce`, `broker.shutdown` or `broker.nuke` will wait indefinitely. You can specify a `closeTimeout` in your subscription config, however if this is exceeded the `subscription.cancel` and `broker.unsubscribeAll` methods will yield an error, while the `broker.bounce`, `broker.shutdown` and `broker.nuke` methods will emit an error, but attempt to continue. In both cases the error will have a code of `ETIMEDOUT` and message stating `Callback function "waitForUnacknowledgedMessages" timed out`.

### Special Note

RabbitMQ 3.8.0 introduced [quorum queues](https://www.rabbitmq.com/quorum-queues.html). Although quorum queues may not be suitable in all situations, they provide [poison message handling](https://www.rabbitmq.com/quorum-queues.html#poison-message-handling) without the need for an external [redelivery counter](https://github.com/guidesmiths/rascal#dealing-with-redeliveries) and offer better data safety in the event of a network partition. You can read more about them [here](https://www.cloudamqp.com/blog/reasons-you-should-switch-to-quorum-queues.html) and [here](https://blog.rabbitmq.com/posts/2020/06/quorum-queues-local-delivery).

## Examples

### Async/Await

```js
const Broker = require('rascal').BrokerAsPromised;
const config = require('./config');

(async () => {
  try {
    const broker = await Broker.create(config);
    broker.on('error', console.error);

    // Publish a message
    const publication = await broker.publish('demo_publication', 'Hello World!');
    publication.on('error', console.error);

    // Consume a message
    const subscription = await broker.subscribe('demo_subscription');
    subscription
      .on('message', (message, content, ackOrNack) => {
        console.log(content);
        ackOrNack();
      })
      .on('error', console.error);
  } catch (err) {
    console.error(err);
  }
})();
```

### Callbacks

```js
const Broker = require('rascal').Broker;
const config = require('./config');

Broker.create(config, (err, broker) => {
  if (err) throw err;

  broker.on('error', console.error);

  // Publish a message
  broker.publish('demo_publication', 'Hello World!', (err, publication) => {
    if (err) throw err;
    publication.on('error', console.error);
  });

  // Consume a message
  broker.subscribe('demo_subscription', (err, subscription) => {
    if (err) throw err;
    subscription
      .on('message', (message, content, ackOrNack) => {
        console.log(content);
        ackOrNack();
      })
      .on('error', console.error);
  });
});
```

See [here](https://github.com/guidesmiths/rascal/tree/master/examples) for more examples.

## Avoiding Potential Message Loss

There are three situations when Rascal will nack a message without requeue, leading to potential data loss.

1. When it is unable to parse the message content and the subscriber has no 'invalid_content' listener
1. When the subscriber's (optional) redelivery limit has been exceeded and the subscriber has neither a 'redeliveries_error' nor a 'redeliveries_exceeded' listener
1. When attempting to recover by [republishing](#republishing), [forwarding](#forwarding), but the recovery operation fails.

The reason Rascal nacks the message is because the alternatives are to leave the message unacknowledged indefinitely, or to rollback and retry the message in an infinite tight loop. This can DDOS your application and cause problems for your infrastructure. Providing you have correctly configured dead letter queues and/or listen to the "invalid_content" and "redeliveries_exceeded" subscriber events, your messages should be safe.

## Very Important Section About Event Handling

[amqplib](https://www.npmjs.com/package/amqplib) emits error events when a connection or channel encounters a problem. Rascal will listen for these and provided you use the default configuration will attempt automatic recovery (reconnection etc), however these events can indicate errors in your code, so it's also important to bring them to your attention. Rascal does this by re-emitting the error event, which means if you don't handle them, they will bubble up to the uncaught error handler and crash your application. There are four places where you should do this

1. Immediately after obtaining a broker instance

   ```js
   broker.on('error', (err, { vhost, connectionUrl }) => {
     console.error('Broker error', err, vhost, connectionUrl);
   });
   ```

2. After subscribing to a channel

   ```js
   // Async/Await
   try {
     const subscription = await broker.subscribe('s1');
     subscription
       .on('message', (message, content, ackOrNack) => {
         // Do stuff with message
       })
       .on('error', (err) => {
         console.error('Subscriber error', err);
       });
   } catch (err) {
     throw new Error(`Rascal config error: ${err.message}`);
   }
   ```

   ```js
   // Callbacks
   broker.subscribe('s1', (err, subscription) => {
     if (err) throw new Error(`Rascal config error: ${err.message}`);
     subscription
       .on('message', (message, content, ackOrNack) => {
         // Do stuff with message
       })
       .on('error', (err) => {
         console.error('Subscriber error', err);
       });
   });
   ```

3. After publishing a message

   ```js
   // Async/Await
   try {
     const publication = await broker.publish('p1', 'some text');
     publication.on('error', (err, messageId) => {
       console.error('Publisher error', err, messageId);
     });
   } catch (err) {
     throw new Error(`Rascal config error: ${err.message}`);
   }
   ```

   ```js
   // Callbacks
   broker.publish('p1', 'some text', (err, publication) => {
     if (err) throw new Error(`Rascal config error: ${err.message}`);
     publication.on('error', (err, messageId) => {
       console.error('Publisher error', err, messageId);
     });
   });
   ```

4. After forwarding a message

   ```js
   // Async/Await
   try {
     const publication = await broker.forward('p1', message);
     publication.on('error', (err, messageId) => {
       console.error('Publisher error', err, messageId);
     });
   } catch (err) {
     throw new Error(`Rascal config error: ${err.message}`);
   }
   ```

   ```js
   // Callbacks
   broker.forward('p1', message, (err, publication) => {
     if (err) throw new Error(`Rascal config error: ${err.message}`);
     publication.on('error', (err, messageId) => {
       console.error('Publisher error', err, messageId);
     });
   });
   ```

### Other Broker Events

#### vhost_initialised

The broker emits the `vhost_initialised` event after recovering from a connection error. An object containing the vhost name and connection url (with obfuscated password) are passed to he event handler. e.g.

```js
broker.on('vhost_initialised', ({ vhost, connectionUrl }) => {
  console.log(`Vhost: ${vhost} was initialised using connection: ${connectionUrl}`);
});
```

#### blocked / unblocked

RabbitMQ notifies clients of [blocked and unblocked](https://www.rabbitmq.com/connection-blocked.html) connections, which rascal forwards from the connection to the broker. e.g.

```js
broker.on('blocked', (reason, { vhost, connectionUrl }) => {
  console.log(`Vhost: ${vhost} was blocked using connection: ${connectionUrl}. Reason: ${reason}`);
});
broker.on('unblocked', ({ vhost, connectionUrl }) => {
  console.log(`Vhost: ${vhost} was unblocked using connection: ${connectionUrl}.`);
});
```

## Configuration

Rascal is highly configurable, but ships with what we consider to be sensible defaults (optimised for reliability rather than speed) for production and test environments.

```js
var rascal = require('rascal');
var definitions = require('./your-config.json');
var config = rascal.withDefaultConfig(definitions);
```

or

```js
var rascal = require('rascal');
var definitions = require('./your-test-config.json');
var config = rascal.withTestConfig(definitions);
```

We advise you to review these defaults before using them in an environment you care about.

The most common configuration options are

- [connection](#connection)
- [exchanges](#exchanges)
- [queues](#queues)
- [publications](#publications)
- [subscriptions](#subscriptions)

A simple configuration is shown below. You can reference Rascal's JSON schema from the config to enable validation and suggestions in compatible IDEs.

```json
{
  "$schema": "./node_modules/rascal/lib/config/schema.json",
  "vhosts": {
    "/": {
      "connection": {
        "url": "amqp://user:password@broker.example.com:5742/"
      },
      "exchanges": ["demo_ex"],
      "queues": ["demo_q"],
      "bindings": ["demo_ex[a.b.c] -> demo_q"],
      "publications": {
        "demo_pub": {
          "exchange": "demo_ex",
          "routingKey": "a.b.c"
        }
      },
      "subscriptions": {
        "demo_sub": {
          "queue": "demo_q",
          "prefetch": 3
        }
      }
    }
  }
}
```

### Vhosts

#### connection

The simplest way to specify a connection is with a url

```json
{
  "vhosts": {
    "v1": {
      "connection": "amqp://guest:guest@broker.example.com:5672/v1?heartbeat=10"
    }
  }
}
```

Alternatively you can specify the individual connection details

```json
{
  "vhosts": {
    "v1": {
      "connection": {
        "slashes": true,
        "protocol": "amqp",
        "hostname": "localhost",
        "user": "guest",
        "password": "guest",
        "port": 5672,
        "vhost": "v1",
        "options": {
          "heartbeat": 5
        },
        "socketOptions": {
          "timeout": 10000
        }
      }
    }
  }
}
```

Any attributes you add to the "options" sub document will be converted to query parameters. Any attributes you add in the "socketOptions" sub document will be passed directly to amqplib's connect method (which hands them off to `net` or `tls`. Providing you merge your configuration with the default configuration `rascal.withDefaultConfig(config)` you need only specify the attributes you want to override

```json
{
  "vhosts": {
    "v1": {
      "connection": {
        "hostname": "broker.example.com",
        "user": "bob",
        "password": "secret"
      }
    }
  }
}
```

Rascal also supports automatic connection retries. It's enabled in the default config, or you want enable it specifically as follows.

```json
{
  "vhosts": {
    "v1": {
      "connection": {
        "retry": {
          "min": 1000,
          "max": 60000,
          "factor": 2,
          "strategy": "exponential"
        }
      }
    }
  }
}
```

or

```json
{
  "vhosts": {
    "v1": {
      "connection": {
        "retry": {
          "min": 1000,
          "max": 5000,
          "strategy": "linear"
        }
      }
    }
  }
}
```

The exponential configuration will cause rascal to retry the connection at exponentially increasing intervals to a maximum of one minute. The intervals are adjusted by a random amount so that if you have multiple services they will not all reconnect at the same time.

The linear configuration will cause rascal to retry the connection at linearly increasing intervals, between one and five seconds.

#### Cluster Connections

If you specify an array of connections instead of a single connection object Rascal will order then as per the connection strategy at startup, and cycle through until it obtains a connection or exhausts all hosts.

```json
{
  "vhosts": {
    "v1": {
      "connectionStrategy": "random",
      "connections": ["amqp://guest:guest@broker1.example.com:5672/v1?heartbeat=10", "amqp://guest:guest@broker2.example.com:5672/v1?heartbeat=10", "amqp://guest:guest@broker3.example.com:5672/v1?heartbeat=10"]
    }
  }
}
```

The default connection strategy is `random`, but if you prefer an active/passive configuration you should use `fixed`.

#### broker.getConnections()

You can see the list of Rascal managed connections by calling `broker.getConnections()`. This will return an array similar to the following...

```json
[
  { "vhost": "/", "connectionUrl": "amqp://guest:***@localhost:5672?heartbeat=50&connection_timeout=10000&channelMax=100" }
  { "vhost": "other", "connectionUrl": "amqp://guest:***@localhost:5672/other?heartbeat=50&connection_timeout=10000&channelMax=100" }
]
```

#### Management connection configuration

**Please note: this functionality is mainly useful in test environments, since it does not create users or grant them permissions to vhosts**

The AMQP protocol doesn't support assertion or checking of vhosts, so Rascal uses the RabbitMQ management API to achieve a similar result. The `management` connection configuration is derived from defaults and the vhost connection, but can be explicitly specified as follows...

```json
{
  "vhosts": {
    "v1": {
      "connection": {
        "hostname": "broker.example.com",
        "user": "bob",
        "password": "secret",
        "management": {
          "protocol": "https",
          "pathname": "prefix",
          "user": "admin",
          "password": "super-secret",
          "options": {
            "timeout": 1000
          }
        }
      }
    }
  }
}
```

Rascal uses [superagent](https://github.com/visionmedia/superagent) under the hood. URL configuration is supported.

```json
{
  "vhosts": {
    "v1": {
      "connections": [
        {
          "url": "amqp://guest:guest@broker1.example.com:5672/v1?heartbeat=10",
          "management": "http://guest:guest@broker1.example.com:15672"
        },
        {
          "url": "amqp://guest:guest@broker2.example.com:5672/v1?heartbeat=10",
          "management": "http://guest:guest@broker2.example.com:15672"
        },
        {
          "url": "amqp://guest:guest@broker3.example.com:5672/v1?heartbeat=10",
          "management": "http://guest:guest@broker3.example.com:15672"
        }
      ]
    }
  }
}
```

You can also supply your own agent via the broker components. Use this when you need to set [TLS options](https://visionmedia.github.io/superagent/#tls-options).

```js
const superagent = require('superagent-defaults');
const agent = superagent().on('request', (req) => console.log(req.url));
const components = { agent };
const broker = await Broker.create(config, components);
```

#### assert

When set to true, Rascal will create the vhost if one doesn't exist using the RabbitMQ management API. This requires the [management plugin](https://www.rabbitmq.com/management.html) to be installed on the broker and for the management user to have necessary permissions.

```json
{
  "vhosts": {
    "v1": {
      "assert": true
    }
  }
}
```

#### check

When set to true, Rascal will check that the vhost exists using the RabbitMQ management API. This requires the [management plugin](https://www.rabbitmq.com/management.html) to be installed on the broker and for the management user to have necessary permissions.

```json
{
  "vhosts": {
    "v1": {
      "check": true
    }
  }
}
```

#### Channel pooling

Rascal useds pools channels it uses for publishing messages. It creates two pools per vhost - one for confirm channels, and other one for regular channels. The default maximum pool size is 5 and the minimum 1, but neither pool will be created until first use (override this by setting `autostart: true`). Idle channels are automatically evicted from the pool. The pool configuration can be adjusted through config, which is passed through to the underlying [generic-pool](https://www.npmjs.com/package/generic-pool) library.

```json
{
  "vhosts": {
    "v1": {
      "publicationChannelPools": {
        "regularPool": {
          "max": 10,
          "min": 5,
          "evictionRunIntervalMillis": 10000,
          "idleTimeoutMillis": 60000,
          "autostart": true
        },
        "confirmPool": {
          "max": 10,
          "min": 5,
          "evictionRunIntervalMillis": 10000,
          "idleTimeoutMillis": 60000,
          "autostart": true
        }
      }
    }
  }
}
```

Unfortunately there is a [bug](https://github.com/coopernurse/node-pool/issues/197#issuecomment-477862861) in generic-pool's implementation, which means that if the pool fails to create a channel, it can enter a tight loop, thrashing your CPU and potentially crashing your node process due to a memory leak. While we assess the long term use of pooling, we have put in a workaround. Errors will only be rejected after a configurable delay. This defaults to one second but can be overriden through the `rejectionDelayMillis` pool attribute. Special thanks to @willthrom for helping diagnose and fix this issue.

#### Flow Control

[amqplib flow control](https://www.squaremobius.net/amqp.node/channel_api.html#flowcontrol) dictates channels act like stream.Writable when Rascal calls `channel.publish` or `channel.sendToQueue`, returning false when the channel is saturated and true if it is not. While it is possible to ignore this and keep publishing messages, it is preferable to apply back pressure to the message source. You can do this by listening to the broker `busy` and `ready` events. Busy events are emitted when the number of outstanding channel requests reach the pool max size, and ready events emitted when the outstanding channel requests falls back down to zero. The pool details are passed to both event handlers so you can take selective action.

```js
broker.on('busy', ({ vhost, mode, queue, size, available, borrowed, min, max }) => {
  if (vhost === 'events') return eventStream.pause();
  console.warn(`vhost ${vhost} is busy`);
});

broker.on('ready', ({ vhost, mode, queue, size, available, borrowed, min, max }) => {
  if (vhost === 'events') return eventStream.resume();
  console.info(`vhost ${vhost} is ready`);
});
```

#### namespace

Running automated tests against shared queues and exchanges is problematic. Messages left over from a previous test run can cause assertions to fail. Rascal has several strategies which help you cope with this problem, one of which is to namespace your queues and exchange.

```json
{
  "vhosts": {
    "v1": {
      "namespace": true
    }
  }
}
```

If you specify `"namespace" :true` Rascal will prefix the queues and exchanges it creates with a uuid. Alternatively you can specify your own namespace, `"namespace": "foo"`. Namespaces are also if you want to use a single vhost locally but multiple vhosts in other environments.

#### Exchanges

##### assert

Setting assert to true will cause Rascal to create the exchange on initialisation. If the exchange already exists and has the same configuration (type, durability, etc) everything will be fine, however if the existing exchange has a different configuration an error will be returned. Assert is enabled in the default configuration.

##### check

If you don't want to create exchanges on initialisation, but still want to validate that they exist set assert to false and check to true

```json
{
  "vhosts": {
    "v1": {
      "exchanges": {
        "e1": {
          "assert": false,
          "check": true
        }
      }
    }
  }
}
```

##### type

Declares the exchange type. Must be one of direct, topic, headers or fanout. The default configuration sets the exchange type to "topic" unless overriden.

##### options

Define any further configuration in an options block

```json
{
  "vhosts": {
    "v1": {
      "exchanges": {
        "e1": {
          "type": "fanout",
          "options": {
            "durable": false
          }
        }
      }
    }
  }
}
```

Refer to the [amqplib](https://www.squaremobius.net/amqp.node/channel_api.html) documentation for further exchange options.

#### Queues

##### assert

Setting assert to true will cause Rascal to create the queue on initialisation. If the queue already exists and has the same configuration (durability, etc) everything will be fine, however if the existing queue has a different configuration an error will be returned. Assert is enabled in the default configuration.

##### check

If you don't want to create queues on initialisation, but still want to validate that they exist set assert to false and check to true

```json
{
  "vhosts": {
    "v1": {
      "queues": {
        "q1": {
          "assert": false,
          "check": true
        }
      }
    }
  }
}
```

##### purge

Enable to purge the queue during initialisation. Useful when running automated tests

```json
{
  "vhosts": {
    "v1": {
      "queues": {
        "q1": {
          "purge": true
        }
      }
    }
  }
}
```

##### options

Define any further configuration in an options block

```json
{
  "queues": {
    "q1": {
      "options": {
        "durable": false,
        "exclusive": true
      }
    }
  }
}
```

To define a queue with extentions add arguments to the options block

```json
{
  "queues": {
    "q1": {
      "options": {
        "durable": false,
        "arguments": {
          "x-message-ttl": 65000,
          "x-queue-mode": "lazy"
        }
      }
    }
  }
}
```

Refer to the [amqplib](https://www.squaremobius.net/amqp.node/channel_api.html) documentation for further queue options.

#### bindings

You can bind exchanges to exchanges, or exchanges to queues.

```json
{
  "vhosts": {
    "v1": {
      "exchanges": {
        "e1": {}
      },
      "queues": {
        "q1": {}
      },
      "bindings": {
        "b1": {
          "source": "e1",
          "destination": "q1",
          "destinationType": "queue",
          "bindingKey": "foo"
        }
      }
    }
  }
}
```

When using Rascals defaults, destinationType will default to "queue" and "bindingKey" will default to "#" (although this is only applicable for topics anyway)

Should you want to bind a destination to the same source with multiple binding keys, instead of duplicating the configuration you can specify an array of binding keys using either the "bindingKey" or "bindingKeys" attribute

```json
{
  "vhosts": {
    "v1": {
      "exchanges": {
        "e1": {}
      },
      "queues": {
        "q1": {}
      },
      "bindings": {
        "b1": {
          "source": "e1",
          "destination": "q1",
          "destinationType": "queue",
          "bindingKeys": ["foo", "bar"]
        }
      }
    }
  }
}
```

If you want to bind to a headers exchange specify the appropriate binding options

```json
{
  "vhosts": {
    "v1": {
      "exchanges": {
        "e1": {
          "type": "headers"
        }
      },
      "queues": {
        "q1": {}
      },
      "bindings": {
        "b1": {
          "source": "e1",
          "destination": "q1",
          "options": {
            "x-match": "all",
            "foo": "bar"
          }
        }
      }
    }
  }
}
```

### Publications

Now that you've bound your queues and exchanges, you need to start sending them messages. This is where publications come in.

```json
{
  "publications": {
    "p1": {
      "vhost": "v1",
      "exchange": "e1",
      "routingKey": "foo"
    }
  }
}
```

```js
broker.publish('p1', 'some message');
```

If you prefer to send messages to a queue

```json
{
  "publications": {
    "p1": {
      "vhost": "v1",
      "queue": "q1"
    }
  }
}
```

> To save you entering the vhost you can nest publications inside the vhost block. Rascal also creates default publications for every queue and exchange so providing you don't need to specify any additional options you don't need to include a publications block at all. Auto created publications have the following configuration

```json
{
  "publications": {
    "/e1": {
      "vhost": "/",
      "exchange": "e1",
      "autoCreated": true
    },
    "v1/q1": {
      "vhost": "/",
      "queue": "q1",
      "autoCreated": true
    }
  }
}
```

Rascal supports text, buffers and anything it can JSON.stringify. Rascal will automatically set the content type to `text/plain` for strings, `application/json` for objects and `application/octet-stream` when [encrypting messages](#encrypting-messages). Alternatively you can explicitly set the content type through the `contentType` option.

The `broker.publish` method is overloaded to accept a runtime routing key or options.

```js
broker.publish('p1', 'some message', callback);
broker.publish('p1', 'some message', 'some.routing.key', callback);
broker.publish('p1', 'some message', {
  routingKey: 'some.routing.key',
  options: { messageId: 'foo', expiration: 5000 },
});
```

```js
await broker.publish('p1', 'some message');
await broker.publish('p1', 'some message', 'some.routing.key');
await broker.publish('p1', 'some message', {
  routingKey: 'some.routing.key',
  options: { messageId: 'foo', expiration: 5000 },
});
```

The callback parameters are err (indicating the publication could not be found) and publication. Listen to the publication's "success" event to obtain confirmation that the message was successfully published (when using confirm channels) and the "error" event to handle errors. The "return" event will be emitted when the message was successfully published but not routed. It is possible to access the messageId from all handlers, either via the supplied messageId or the returned message itself (see below)

If you specify the "mandatory" option (or use Rascal's defaults) you can also listen for returned messages (i.e. messages that were not delivered to any queues)

```js
broker.publish('p1', 'some message', (err, publication) => {
  if (err) throw err; // publication didn't exist
  publication
    .on('success', (messageId) => {
      console.log('Message id was: ', messageId);
    })
    .on('error', (err, messageId) => {
      console.error('Error was: ', err.message);
    })
    .on('return', (message) => {
      console.warn('Message was returned: ', message.properties.messageId);
    });
});
```

```js
try {
  const publication = await broker.publish('p1', 'some message');
  publication
    .on('success', (messageId) => {
      console.log('Message id was: ', messageId);
    })
    .on('error', (err, messageId) => {
      console.error('Error was: ', err.message);
    })
    .on('return', (message) => {
      console.warn('Message was returned: ', message.properties.messageId);
    });
} catch (err) {
  // publication didn't exist
}
```

One publish option you should be aware of is the "persistent". Unless persistent is true, your messages will be discarded when you restart Rabbit. Despite having an impact on performance Rascal sets this in it's default configuration.

Refer to the [amqplib](https://www.squaremobius.net/amqp.node/channel_api.html) documentation for further exchange options.

**It's important to realise that even though publication emits a "success" event, this offers no guarantee that the message has been sent UNLESS you use a confirm channel**. Providing you use Rascal's defaults publications will always be confirmed.

```json
{
  "publications": {
    "p1": {
      "exchange": "e1",
      "vhost": "v1",
      "confirm": true
    }
  }
}
```

#### Publishing to a queue via the default exchange

If you would like to publish directly to a queue, but you don't know the queue name ahead of time, you can use the fact that [all queues are automatically bound to the default exchange](https://www.rabbitmq.com/tutorials/amqp-concepts.html#exchange-default) with the routing key which is the same as the queue name.

You can publish directly to the queue:

```
broker.publish('/', 'content', 'q1', (err, publication) => { ... });
```

See the "default-exchange" in the examples directory for a full working example.

#### Timeouts

When you publish a message using a confirm channel, amqplib will wait for an acknowledgement that the message was safely received by the broker, and in a clustered environment replicated to all nodes. If something goes wrong, the broker will not send the acknowledgement, amqplib will never execute the callback, and the associated flow of execution will never be resumed. Rascal guards against this by adding publication timeouts. If the timeout expires, then Rascal will close the channel and emit a error event from the publication, however there will still be an unavoidable memory leak as amqplib's callback will never be cleared up. The default timeout is 10 seconds but can be overriden in config. The setting is ignored for normal channels and can be disabled by specifying 0.

```json
{
  "publications": {
    "p1": {
      "exchange": "e1",
      "vhost": "v1",
      "confirm": true,
      "timeout": 10000
    }
  }
}
```

If you start experiencing publication timeouts you may find it useful to monitor the publication statistics via the `publication.stats` object, which includes the duration of Rascal's low level publish operations.

#### Aborting

Rascal uses a channel pool to publish messages. Access to the channel pool is synchronised via an in memory queue, which will be paused if the connection to the broker is temporarily lost. Consequently instead of erroring, publishes will be held until the connection is re-established. If you would rather abort under these circumstances, you can listen for the publication 'paused' event, and call `publication.abort()`. When the connection is re-established any aborted messages will be dropped instead of published.

```js
broker.publish('p1', 'some message', (err, publication) => {
  if (err) throw err; // publication didn't exist
  publication
    .on('success', (messageId) => {
      console.log('Message id was: ', messageId);
    })
    .on('error', (err, messageId) => {
      console.error('Error was: ', err.message);
    })
    .on('paused', (messageId) => {
      console.warn('Publication was paused. Aborting message: ', messageId);
      publication.abort();
    });
});
```

```js
try {
  const publication = await broker.publish('p1', 'some message');
  publication
    .on('success', (messageId) => {
      console.log('Message id was: ', messageId);
    })
    .on('error', (err, messageId) => {
      console.error('Error was: ', err.message);
    })
    .on('paused', (messageId) => {
      console.warn('Publication was paused. Aborting message: ', messageId);
      publication.abort();
    });
} catch (err) {
  // publication didn't exist
}
```

#### Encrypting messages

Rascal can be configured to automatically encrypt outbound messages.

```json
{
  "vhosts": {
    "v1": {
      "exchanges": ["e1"]
    }
  },
  "publications": {
    "p1": {
      "exchange": "e1",
      "vhost": "v1",
      "confirm": true,
      "encryption": "well-known-v1"
    }
  },
  "encryption": {
    "well-known-v1": {
      "key": "f81db52a3b2c717fe65d9a3b7dd04d2a08793e1a28e3083db3ea08db56e7c315",
      "ivLength": 16,
      "algorithm": "aes-256-cbc"
    }
  }
}
```

Rascal will set the content type for encrypted messages to 'application/octet-stream'. It stashes the original content type in a header. Providing you use a correctly configured [subscription](#subscriptions), the message will be automatically decrypted, and normal content handling applied.

#### Forwarding messages

Sometimes you want to forward a message to a publication. This may be part of a shovel program for transferring messages between vhosts, or because you want to ensure a sequence in some workflow, but do not need to modify the original message. Rascal supports this via `broker.forward`. The syntax is similar to `broker.publish` except from you pass in the original message you want to be forwarded instead of the message payload. If the publication or overrides don't specify a routing key, the original forwarding key will be maintained. The message will also be CC'd with an additional routingkey of `<queue>.<routingKey>` which can be useful for some retry scenarios.

```js
broker.forward('p1', message, overrides, (err, publication) => {
  if (err) throw err; // publication didn't exist
  publication
    .on('success', (messageId) => {
      console.log('Message id was: ', messageId);
    })
    .on('error', (err, messageId) => {
      console.error('Error was: ', err.message);
    })
    .on('return', (message) => {
      console.warn('Message was returned: ', message.properties.messageId);
    });
});
```

```js
try {
  const publication = await broker.forward('p1', message, overrides);
  publication
    .on('success', (messageId) => {
      console.log('Message id was: ', messageId);
    })
    .on('error', (err, messageId) => {
      console.error('Error was: ', err.message);
    })
    .on('return', (message) => {
      console.warn('Message was returned: ', message.properties.messageId);
    });
} catch (err) {
  // publication didn't exist
}
```

Prior to version 10.0.0, if you used Rascal to consume a forwarded message, the subscriber would automatically restore the original routing key and exchange to the message.fields before emitting it. This was added to support the delayed retry loop advanced recovery strategy, but should not have been applied to `broker.forward`. From version 10.0.0 this behaviour has been disabled for `broker.forward` but you can turn it back on by setting `restoreRoutingHeaders` to true in the overrides. You can also disable this behaviour in the `forward` and `republish` recovery strategies by setting `restoreRoutingHeaders` to false.

**Since there is no native, transactional support for forwarding in amqplib, you are at risk of receiving duplicate messages when using `broker.foward`**

### Subscriptions

The real fun begins with subscriptions

```json
{
  "subscriptions": {
    "s1": {
      "queue": "e1",
      "vhost": "v1"
    }
  }
}
```

```js
broker.subscribe('s1', (err, subscription) => {
  if (err) throw err; // subscription didn't exist
  subscription
    .on('message', (message, content, ackOrNack) => {
      // Do stuff with message
    })
    .on('error', (err) => {
      console.error('Subscriber error', err);
    });
});
```

```js
try {
  const subscription = await broker.subscribe('s1');
  subscription
    .on('message', (message, content, ackOrNack) => {
      // Do stuff with message
    })
    .on('error', (err) => {
      console.error('Subscriber error', err);
    });
} catch (err) {
  // subscription didn't exist
}
```

It's **very** important that you handle errors emitted by the subscriber. If not an underlying channel error will bubble up to the uncaught error handler and crash your node process.

Prior to Rascal 4.0.0 it was also **very** important not to go async between getting the subscription and listening for the message or error events. If you did, you risked leaking messages and not handling errors. For Rascal 4.0.0 and beyond, subsciptions are lazily applied when you add the `message` handller. Because registering event handlers is synchronous, but setting up RabbitMQ consumers is asynchronous, we've also added the `subscribed` event in case you need to wait until the subscription has been successfully established.

Rascal supports text, buffers and anything it can JSON.parse, providing the contentType message property is set correctly. Text messages should be set to "text/plain" and JSON messages to "application/json". Other content types will be returned as a Buffer. If the publisher doesn't set the contentType or you want to override it you can do so in the subscriber configuration.

```json
{
  "subscriptions": {
    "s1": {
      "queue": "e1",
      "vhost": "v1",
      "contentType": "application/json"
    }
  }
}
```

The `broker.subscribe` method also accepts an options parameter which will override options specified in config

```js
broker.subscribe('s1', { prefetch: 10, retry: false }, callback);
```

```js
await subscription = broker.subscribe("s1", { prefetch: 10, retry: false })
```

The arguments passed to the message event handler are `function(message, content, ackOrNack)`, where message is the raw message, the content (a buffer, text, or object) and an ackOrNack callback. This ackOrNack callback should only be used for messages which were not `{ "options": { "noAck": true } }` by the subscription configuration or the options passed to `broker.subscribe`. For more details on acking or nacking messages see [Message Acknowledgement and Recovery Strategies](#message-acknowledgement-and-recovery-strategies).

> As with publications, you can nest subscriptions inside the vhost block. Rascal creates default subscriptions for every queue so providing you don't need to specify any additional options you don't need to include a subscriptions block at all.

#### Subscribe All

You can subscribe to multiple subscriptions using `broker.subscribeAll`.

```js
broker.subscribeAll((err, subscriptions) => {
  if (err) throw err; // one or more subscriptions didn't exist
  subscriptions.forEach((subscription) => {
    subscription
      .on('message', (message, content, ackOrNack) => {
        // Do stuff with message
      })
      .on('error', (err) => {
        console.error('Subscriber error', err);
      });
  });
});
```

```js
try {
  const subscriptions = await broker.subscribeAll();
  subscriptions.forEach((subscription) => {
    subscription
      .on('message', (message, content, ackOrNack) => {
        // Do stuff with message
      })
      .on('error', (err) => {
        console.error('Subscriber error', err);
      });
  });
} catch (err) {
  // One or more subscriptions didn't exist
}
```

subscribeAll takes a filter so you can ignore subscriptions if required. This is especially useful for ignoring the rascals default subscriptions. e.g.

```js
broker.subscribeAll(
  (s) => !s.autoCreated,
  (err, subscriptions) => {
    if (err) throw err; // one or more subscriptions didn't exist
    subscriptions.forEach((subscription) => {
      subscription
        .on('message', (message, content, ackOrNack) => {
          // Do stuff with message
        })
        .on('error', (err) => {
          console.error('Subscriber error', err);
        });
    });
  }
);
```

```js
try {
  const subscriptions = await broker.subscribeAll(s => !s.autoCreated) => {
  subscriptions.forEach(subscription => {
    subscription.on('message', (message, content, ackOrNack) => {
      // Do stuff with message
    }).on('error', (err) => {
      console.error('Subscriber error', err)
    })
  });
} catch(err) {
  // One or more subscriptions didn't exist
}
```

#### Invalid Messages

If rascal can't parse the content (e.g. the message had a content type of 'application/json' but the content was not JSON), it will emit an 'invalid_content' event

```js
broker.subscribe('s1', (err, subscription) => {
  if (err) throw err; // subscription didn't exist
  subscription
    .on('message', (message, content, ackOrNack) => {
      // Do stuff with message
    })
    .on('error', (err) => {
      console.error('Subscriber error', err);
    })
    .on('invalid_content', (err, message, ackOrNack) => {
      console.error('Invalid content', err);
      ackOrNack(err);
    });
});
```

```js
try {
  const subscription = await broker.subscribe('s1');
  subscription
    .on('message', (message, content, ackOrNack) => {
      // Do stuff with message
    })
    .on('error', (err) => {
      console.error('Subscriber error', err);
    })
    .on('invalid_content', (err, message, ackOrNack) => {
      console.error('Invalid content', err);
      ackOrNack(err);
    });
} catch (err) {
  // subscription didn't exist
}
```

If the message has not been auto-acknowledged you should ackOrNack it. **If you do not listen for the invalid_content event rascal will nack the message (without requeue) and emit an error event instead, leading to message loss if you have not configured a dead letter exchange/queue**.

#### Handling Cancel Notifications

The RabbitMQ broker may [cancel](https://www.rabbitmq.com/consumer-cancel.html) the consumer if the queue is deleted or the node on which the queue is located fails. [amqplib](https://www.squaremobius.net/amqp.node/channel_api.html#channel_consume) handles this by delivering a `null` message. When Rascal receives the null message it will

1. Emit a `cancelled` event from the subscription.
1. Emit an `error` event from the subscription if the `cancel` event was not handled
1. Optionally attempt to resubscribe as per normal retry configuration. If the queue was deleted rather than being failed over, the queue will not automatically be re-created and retry attempts will fail indefinitely.

#### Decrypting messages

Rascal can be configured to automatically decrypt inbound messages.

```json
{
  "vhosts": {
    "v1": {
      "queues": ["e1"]
    }
  },
  "subscriptions": {
    "s1": {
      "queue": "e1",
      "vhost": "v1"
    }
  },
  "encryption": {
    "well-known-v1": {
      "key": "f81db52a3b2c717fe65d9a3b7dd04d2a08793e1a28e3083db3ea08db56e7c315",
      "ivLength": 16,
      "algorithm": "aes-256-cbc"
    }
  }
}
```

Any message that was published using the "well-known-v1" encryption profile will be automatically decrypted by the subscriber.

#### Dealing With Redeliveries

If your app crashes before acknowledging a message, the message will be rolled back. It is common for node applications to automatically restart, however if the crash was caused by something in the message content, it will crash and restart indefinitely, thrashing the host. Prior to version 3.8.0, RabbitMQ didn't allow you to limit the number of redeliveries per message or provide a redelivery count. This is now possible using [quorum queues](https://www.rabbitmq.com/quorum-queues.html#poison-message-handling), but for those on older versions, or in situations where quorum queues are not appropriate, subscribers can be configured with a redelivery counter and will update the `message.properties.headers.rascal.redeliveries` header with the number of hits. If the number of redeliveries exceeds the subscribers limit, the subscriber will emit a "redeliveries_exceeded" event, and can be handled by your application. e.g.

```json
"subscriptions": {
    "s1": {
        "vhost": "/",
        "queue": "q1",
        "redeliveries": {
            "limit": 10,
            "counter": "<counter name>"
        }
    }
},
"redeliveries": {
    "counters": {
        "<counter name>": {
            "type": "<counter type>",
            "size": 1000,
        }
    }
}
```

```js
broker.subscribe('s1', (err, subscription) => {
  if (err) throw err; // subscription didn't exist
  subscription
    .on('message', (message, content, ackOrNack) => {
      // Do stuff with message
    })
    .on('error', (err) => {
      console.error('Subscriber error', err);
    })
    .on('redeliveries_exceeded', (err, message, ackOrNack) => {
      console.error('Redeliveries exceeded', err);
      ackOrNack(err);
    });
});
```

```js
try {
  const subscription = await broker.subscribe('s1');
  subscription
    .on('message', (message, content, ackOrNack) => {
      // Do stuff with message
    })
    .on('error', (err) => {
      console.error('Subscriber error', err);
    })
    .on('redeliveries_exceeded', (err, message, ackOrNack) => {
      console.error('Redeliveries exceeded', err);
      ackOrNack(err);
    });
} catch (err) {
  // subscription didn't exist
}
```

If you do not listen for the redeliveries_exceeded event rascal will nack the message without requeue **leading to message loss if you have not configured a dead letter exchange/queue**.

Rascal provides three counter implementations:

1. stub - this is the default and does nothing.
2. inMemory - useful only for testing since if your node process crashes, the counter will be vaporised too
3. inMemoryCluster - like the inMemory, but since the counter resides in the master it survives worker crashes.

Of the three only inMemoryCluster is useful in production, and then only if you are using [clustering](https://nodejs.org/api/cluster.html). See the [advanced example](https://github.com/guidesmiths/rascal/tree/master/examples/advanced) for how to configure it.

#### Implementing your own counter

If your application is not clustered, but you still want to protect yourself from redeliveries, you need to implement your own counter backed by something like redis. In times of high message volumes the counter will be hit hard so you should make sure it's fast and resilient to failure/slow responses from the underlying store.

See [here](https://www.npmjs.com/package/rascal-redis-counter) for a redis backed counter.

#### Message Acknowledgement and Recovery Strategies

For messages which are not auto-acknowledged (the default) calling `ackOrNack()` with no arguments will acknowledge it. Calling `ackOrNack(err)` will nack the message using Rascal's default recovery strategy (nack with requeue). Calling `ackOrNack(err, recoveryOptions)` will trigger the specified recovery strategy or strategies.

When using the callback API, you can call ackOrNack without a callback and errors will be emitted by the subscription. Alternatively you can specify a callback as the final argument irrespective of what other arguments you provide.

When using the promises API, ackOrNack will work as for the callback API unless you explicity set promisifyAckOrNack to true on the subscription. If you do enable this feature, be sure to catch rejections.

##### Nack (Reject or Dead Letter)

```js
ackOrNack(err, { strategy: 'nack' });
```

Nack causes the message to be discarded or routed to a dead letter exchange if configured.

##### Nack with Requeue

```js
ackOrNack(err, { strategy: 'nack', defer: 1000, requeue: true });
```

The defer option is not mandatory, but without it you are likely retry your message thousands of times a second. Even then requeueing is a inadequate strategy for error handling, since the message will be rolled back to the front of the queue and there is no simple way to detect how many times the message has been redelivered.

Dead lettering is a good option for invalid messages but with one major flaw - because the message cannot be modified it cannot be annotated with the error details. This makes it difficult to do anything useful with messages once dead lettered.

##### Republish

```js
ackOrNack(err, { strategy: 'republish', defer: 1000 });
```

An alternative to nacking to republish the message back to the queue it came from. This has the advantage that the message will be resent to the back of the queue, allowing other messages to be processed and potentially fixing errors relating to ordering.

Rascal keeps track of the number of republishes so you can limit the number of attempts. **Whenever you specify a number of attempts you should always chain a fallback strategy**, otherwise if the attempts are exceeded your message will be neither acked or nacked.

```js
ackOrNack(err, [{ strategy: 'republish', defer: 1000, attempts: 10 }, { strategy: 'nack' }]);
```

Rascal also annotates the message with detail of the error `message.properties.headers.rascal.<queue>.error` which can be useful if you eventually dead letter it.

Before using republish please consider the following:

1. Rascal will copy messages properties from the original message to the republished one. If you set an expiration time on the original message this will also be recopied, effectively resetting it.

2. Rascal will ack the original message after successfully publishing the copy. This does not take place in a distributed transaction so there is a potential of the original message being rolled back after the copy has been published (the dead-letter delay loop also suffers from this).

3. Rascal will republish original message using a confirm channel, if the publish fails, the original message will not be nacked (You should mitigate this by chaining recovery strategies).

4. Republishing has the side-effect of clearing message.fields.exchange and setting message.fields.routingKey to the queue name. These fields may be used by your application or by the broker when routing rejected messages to a dead letter exchange. Rascal mitigates the first of these problems by restoring the original values before passing the message to the consumer, however if the message is subsequently rejected/nacked, this information will no longer be available on the broker's copy of the message and may still cause problems for dead letter routing. To resolve this you can bind the dead letter queue to the dead letter exchange twice, using both the original routing key pattern and the queue name. Alternatively you can specify an explicit dead letter routing key by way of the x-dead-letter-routing-key argument when defining the queue.

##### Republish with immediate nack

As mentioned previously, dead lettering invalid messages is a good strategy with one flaw - since there is no way to modify the message you cannot annotate it with failure details. A solution to this is to republish with attempts = 1 and then nacking it to a dead letter exchange. The problem with this approach is that invalid messages will always be processed twice. To workaround this set immediateNack to true in the recovery options. This will instruct Rascal to nack the message immediately instead of emitting the 'message' event.

```js
ackOrNack(err, { strategy: 'republish', immediateNack: true });
```

If you ever want to resend the message to the same queue you will have to remove the `properties.headers.rascal.<queue>.immediateNack` header first.

##### Forward

Instead of republishing the message to the same queue you can forward it to a Rascal publication. You should read the section entitled [Forwarding messages](#Forwarding-messages) to understand the risks of this.

```js
ackOrNack(err, { strategy: 'forward', publication: 'some_exchange' });
```

**Danger**
As with the Republish strategy, you can limit the number of foward attempts. Whenever you specify a number of attempts you should always chain a fallback strategy, otherwise if the attempts are exceeded your message will be neither acked or nacked.

Furthermore if the message is forwarded but cannot be routed (e.g. due to an incorrect binding), the message will be returned **after** Rascal receives a 'success' event from amqplib. Consequently the message will have been ack'd. Any subsequent fallback strategy which attempts to ack or nack the message will fail, and so the message may lost. The subscription will emit an error event under such circumstances.

```js
ackOrNack(err, [
  {
    strategy: 'forward',
    publication: 'some_exchange',
    defer: 1000,
    attempts: 10,
  },
  { strategy: 'nack' },
]);
```

You can also override the publication options

```js
ackOrNack(err, [
  {
    strategy: 'forward',
    publication: 'some_exchange',
    options: { routingKey: 'custom.routing.key' },
  },
  { strategy: 'nack' },
]);
```

One use of the forward recovery strategy is to send messages to a wait queue which will dead-letter them after a period of time. [Repeated dead lettering causes some versions of RabbitMQ to crash](https://github.com/rabbitmq/rabbitmq-server/issues/161). If you encounter this issue upgrade RabbitMQ or specify `xDeathFix: true` which will delete any x-death headers on the message before forwarding.

##### Ack

Acknowledges the message, guaranteeing that it will be discarded in the event you also have a dead letter exchange configured. Sometimes useful in automated tests or when chaining a sequence of other recovery strategies.

```js
ackOrNack(err, { strategy: 'ack' });
```

#### Chaining Recovery Strategies

By chaining Rascal's recovery strategies and leveraging some of RabbitMQs lesser used features such as message you can achieve some quite sophisticated error handling. A simple combination of republish and nack (with dead letter) will enable you to retry the message a maximum number of times before dead letting it.

```js
ackOrNack(err, [
  {
    strategy: 'republish',
    defer: 1000,
    attempts: 10,
  },
  {
    strategy: 'nack',
  },
]);
```

Far more sophisticated strategies are achievable...
![Retry BackOff Fail](https://user-images.githubusercontent.com/229672/49589770-2359d080-f962-11e8-957e-8d5368561afd.png 'Retry BackOff Fail')

1. Producer publishes a message with the routing key "a.b.c" to the "jobs" topic exchange
2. The message is routed to the "incoming" queue. The "incoming" queue is configured with a dead letter exchange.
3. The message is consumed from the queue. An error occurs, triggering the recovery process.
4. The message is decorated with two CC routing keys, "delay.5m" and "incoming.a.b.c", and published to the delay exchange
5. The message is routed to the "5-minute" queue, which is configured to dead letter the message after five minutes.
6. After five minutes the message is dead lettered to the "retry" topic exchange.
7. The message is routed back to the original queue using the CC routing key "incoming.a.b.c"

Steps 3 - 7 will repeat up to `attempts` times. If all attempts fail...

8. The consumer dead letters the message, routing it to the "dead-letters" exchange
9. The message is routed to the "dead-letters" queue

#### prefetch

Prefetch limits the number of unacknowledged messages your application can have outstanding. It's a great way to ensure that you don't overload your event loop or a downstream service. Rascal's default configuration sets the prefetch to 10 which may seem low, but we've managed to knock out firewalls, breach AWS thresholds and all sorts of other things by setting it to higher values.

#### retry

If an error occurs on the channel (which will happen if you accidentally acknowledge a message twice), then it becomes unusable and no more messages will be delivered. Rascal listens to the channel's error even and assuming you are using its defaults will automatically attempt to resubscribe to a new channel after a one second delay. You can disable or customise this in your configuration or in the call to subscribe.

```js
// Does not retry. This will cause an error to be emitted which unhandled will crash your process. See [Subscriber Events](#subscriber-events)
broker.subscribe('s1', { prefetch: 10, retry: false }, callback);

// Retries without delay.
broker.subscribe('s1', { prefetch: 10, retry: true }, callback);

// Retries after a one second interval.
broker.subscribe('s1', { prefetch: 10, retry: { delay: 1000 } }, callback);
```

```js
// Does not retry. This will cause an error to be emitted which unhandled will crash your process. See [Subscriber Events](#subscriber-events)
await broker.subscribe('s1', { prefetch: 10, retry: false });

// Retries without delay.
await broker.subscribe('s1', { prefetch: 10, retry: true });

// Retries after a one second interval.
await broker.subscribe('s1', { prefetch: 10, retry: { delay: 1000 } });
```

#### Subscriber Events

[amqplib](https://www.npmjs.com/package/amqplib) emits error events from the channel. These can happen for a number of reasons, but a common cause is because you have acknowledged the message twice. The subscriber will listen for channel errors so it can automatically re-subscribe but still emits them so they can be reported by your application. If you don not listen to these events or handle them in a domain they will cause your application to crash.

### Defaults

Configuring each vhost, exchange, queue, binding, publication and subscription explicitly wouldn't be much fun. Not only does Rascal ship with default production and test configuration files, but you can also specify your own defaults in your configuration files by adding a "defaults" sub document.

```json
{
  "defaults": {
    "vhosts": {
      "exchanges": {
        "assert": true,
        "type": "topic"
      },
      "queues": {
        "assert": true
      },
      "bindings": {
        "destinationType": "queue",
        "bindingKey": "#"
      }
    },
    "publications": {
      "vhost": "/",
      "confirm": true,
      "options": {
        "persistent": true
      }
    },
    "subscriptions": {
      "vhost": "/",
      "prefetch": 10,
      "retry": {
        "delay": 1000
      },
      "redeliveries": {
        "counter": {
          "size": 1000
        },
        "limit": 1000
      }
    }
  }
}
```

### Cancelling subscriptions

You can cancel subscriptions as follows

```js
broker.subscribe('s1', (err, subscription) => {
  if (err) throw err; // subscription didn't exist
  subscription.cancel((err) => {
    console.err(err);
  });
});
```

```js
try {
  const subscription = await broker.subscribe('s1');
  await subscription.cancel();
} catch (err) {
  // subscription didn't exist or could not be cancelled
}
```

Cancelling a subscribion will stop consuming messages, but leave the channel open until any outstanding messages have been acknowledged, or the timeout specified by through the `closeTimeout` subscription property is exceeded.

## Shutdown

You can shutdown the broker by calling `await broker.shutdown()` or `broker.shutdown(cb)`.

## Bonus Features

### Shorthand Notation

Rascal configuration can get rather verbose, so you can use the shorthand notation

```json
{
  "exchanges": {
    "e1": {},
    "e2": {}
  },
  "queues": {
    "q1": {},
    "q2": {}
  },
  "bindings": {
    "b1": {
      "source": "e1",
      "destination": "q1"
    },
    "b2": {
      "source": "e2",
      "destination": "q2",
      "bindingKeys": ["bk1", "bk2"]
    }
  }
}
```

is equivalent to...

```json
{
  "exchanges": ["e1", "e2"],
  "queues": ["q1", "q2"],
  "bindings": ["e1 -> q1", "e2[bk1, bk2] -> q2"]
}
```

If you need to specify exchange, queue or binding parameters you can mix and match string and object configuration...

```json
{
  "exchanges": {
    "e1": {},
    "e2": {
      "type": "fanout"
    }
  }
}
```

is equivalent to...

```json
{
  "exchanges": [
    "e1",
    {
      "name": "e2",
      "type": "fanout"
    }
  ]
}
```

### Connect

Rascal is a rich pub/sub wrapper and as such hides much of the amqplib [channel api](https://www.squaremobius.net/amqp.node/channel_api.html#channel). If you need to access this you can programmatically establish a connection to a vhost as follows.

```js
broker.connect('/', (err, connection) => {
  if (err) throw new Error(`Connection error: ${err.message}`);
  // profit
});
```

```js
try {
  const connection = broker.connect('/');
  // profit
} catch (err) {
  throw new Error(`Connection error: ${err.message}`);
}
```

This will leverage Rascal's [cluster connection support](#cluster-connections), but you will be responsible for error handling and disconnection.

### Nuke, Purge and UnsubscribeAll

In a test environment it's useful to be able to nuke your setup between tests. The specifics will vary based on your test runner, but assuming you were using [Mocha](http://mochajs.org/)...

```js
afterEach((done) => {
  broker.nuke(done);
});
```

```js
afterEach(async () => {
  await broker.nuke();
});
```

It can be costly to nuke between tests, so if you want the tear down to be quicker use the purge and unsubscribeAll.

```js
afterEach((done) => {
  async.series([broker.unsubscribeAll, broker.purge], done);
});

after((done) => {
  broker.nuke(done);
});
```

```js
afterEach(async () => {
  await broker.unsubscribeAll();
  await broker.purge();
});

after(async () => {
  await broker.nuke();
});
```

### Bounce

Bounce disconnects and reinistialises the broker.

```js
beforeEach((done) => {
  broker.bounce(done);
});
```

```js
beforeEach(async () => {
  await broker.bounce();
});
```

### Shovels

RabbitMQ enables you to transfer messages between brokers using the [Shovel plugin](https://www.rabbitmq.com/shovel.html). You can do something similar with rascal by connecting a subscription to a publication. Shovel relies on rascals 'forward' feature, so all the caveates about duplicate messages apply.

```json
{
  "shovels": {
    "x1": {
      "subscription": "s1",
      "publication": "p1"
    }
  }
}
```

or in shorthand

```json
{
  "shovels": ["s1 -> p1"]
}
```

## Running the tests

```bash
npm test
```

You'll need a RabbitMQ server running locally with default configuration. If that's too much trouble try installing [docker](https://www.docker.com/) and running the following
`npm run docker`
