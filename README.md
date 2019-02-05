# Rascal
Rascal is a config driven wrapper around [amqplib](https://www.npmjs.com/package/amqplib).

[![NPM version](https://img.shields.io/npm/v/rascal.svg?style=flat-square)](https://www.npmjs.com/package/rascal)
[![NPM downloads](https://img.shields.io/npm/dm/rascal.svg?style=flat-square)](https://www.npmjs.com/package/rascal)
[![Build Status](https://img.shields.io/travis/guidesmiths/rascal/master.svg)](https://travis-ci.org/guidesmiths/rascal)
[![Code Climate](https://codeclimate.com/github/guidesmiths/rascal/badges/gpa.svg)](https://codeclimate.com/github/guidesmiths/rascal)
[![Test Coverage](https://codeclimate.com/github/guidesmiths/rascal/badges/coverage.svg)](https://codeclimate.com/github/guidesmiths/rascal/coverage)
[![Code Style](https://img.shields.io/badge/code%20style-imperative-brightgreen.svg)](https://github.com/guidesmiths/eslint-config-imperative)
[![Dependency Status](https://david-dm.org/guidesmiths/rascal.svg)](https://david-dm.org/guidesmiths/rascal)
[![devDependencies Status](https://david-dm.org/guidesmiths/rascal/dev-status.svg)](https://david-dm.org/guidesmiths/rascal?type=dev)

## Deprecation Warnings
1.3.1 added channel pooling, which contained a bug in the connection error handler. Connections were not drained from the pool, resulting in blocking all publications, and adding a message to the channel request queue until your process ran out of memory.

1.4.0 added a 'close' event listener, which would automatically reconnect following the broker closing the connection. In some situations both a 'close' event and 'error' event are emitted causing Rascal to create two new connections. This [may](https://github.com/squaremo/amqp.node/issues/271) be responsible for unknown delivery tag errors.

## tl;dr
Rascal adds the following to [amqplib](https://www.npmjs.com/package/amqplib)

* Config driven vhosts, exchanges, queues, bindings, producers and consumers
* Cluster connection support
* Transparent content parsing
* Transparent encryption / decryption
* Automatic reconnection and resubscription
* Advanced error handling
* Redelivery protection
* Channel pooling
* Safe defaults
* TDD support

See the [examples](https://github.com/guidesmiths/rascal/tree/master/examples)

### Promises and Callbacks Support
Rascal supports both promises and callbacks.
```js
const Rascal = require('rascal');
Rascal.Broker.create(config, function(err, broker) {
  broker.subscribe('s1', function(err, subscription) {
    // etc...
  })
})
```
```js
const Rascal = require('rascal');
const broker = await Rascal.BrokerAsPromised.create(config)
const subscription = await broker.subscribe('s1')
```

## About
Rascal is a wrapper for the excellent [amqplib](https://www.npmjs.com/package/amqplib). One of the best things about amqplib is that it doesn't make assumptions about how you use it. Another is that it doesn't attempt to abstract away [AMQP Concepts](https://www.rabbitmq.com/tutorials/amqp-concepts.html). As a result the library offers a great deal of control and flexibility, but the onus is on you adopt appropriate patterns and configuration. You need to be aware that:

* Messages are not persistent by default and will be lost if your broker restarts
* Messages that crash your app will be infinitely retried
* Without prefetch a sudden flood of messages may bust your event loop
* Dropped connections and borked channels will not be automatically recovered
* Any connection or channel errors are emitted as "error" events. Unless you handle them or use [domains](https://nodejs.org/api/domain.html) these will cause your application to crash

Rascal seeks to either solve these problems, make them easier to deal with or bring them to your attention.

## Caveats
* Rascal currently implements only a small subset of the [amqplib api](http://www.squaremobius.net/amqp.node/channel_api.html). It was written with a strong bias towards moderate volume pub/sub systems for a project with some quite agressive timescales. If you need one of the missing api calls, then your best approach is to submit a [PR](https://github.com/guidesmiths/rascal/pulls).

* There are two situations when Rascal will nack a message without requeue, leading to potential data loss.
  1. When it is unable to parse the message content and the subscriber has no 'invalid_content' listener
  2. When the subscriber's (optional) redelivery limit has been exceeded and the subscriber has neither a 'redeliveries_error' nor a 'redeliveries_exceeded' listener

The reason Rascal nacks the message is because the alternative is to rollback and retry the message in an infinite tight loop. This can DDOS your application and cause problems for your infrastructure. Providing you have correctly configured dead letter queues and/or listen to the "invalid_content" and "redeliveries_exceeded" subscriber events, your messages should be safe.

## VERY IMPORTANT SECTION ABOUT EVENT HANDLING
[amqplib](https://www.npmjs.com/package/amqplib) emits error events when a connection or channel encounters a problem. Rascal will listen for these and provided you use the default configuration will attempt automatic recovery (reconnection etc), however these events can indicate errors in your code, so it's also important to bring them to your attention. Rascal does this by re-emitting the error event, which means if you don't handle them, they will bubble up to the uncaught error handler and crash your application. There are four places where you should do this

1. Immediately after obtaining a broker instance

    ```js
    broker.on('error', function(err) {
      console.error('Broker error', err)
    })
    ```

2. After subscribing to a channel

    ```js
    broker.subscribe('s1', function(err, subscription) {
      if (err) throw new Error('Rascal config error: ', err.message)
      subscription.on('message', function(message, content, ackOrNack) {
        Do stuff with message
      }).on('error', function(err) {
        console.error('Subscriber error', err)
      })
    })
    ```

    ```js
    try {
      const subscription = await broker.subscribe('s1')
      subscription.on('message', function(message, content, ackOrNack) {
        // Do stuff with message
      }).on('error', function(err) {
        console.error('Subscriber error', err)
      })
    } catch(err) {
      throw new Error('Rascal config error: ', err.message)
    }
    ```

3. After publishing a message

    ```js
    broker.publish('p1', 'some text', function(err, publication) {
      if (err) throw new Error('Rascal config error: ', err.message)
      publication.on('error', function(err, messageId) {
        console.error('Publisher error', err, messageId)
      })
    })
    ```

    ```js
    try {
      const publication = await broker.publish('p1', 'some text')
      publication.on('error', function(err, messageId) {
        console.error('Publisher error', err, messageId)
      })
    } catch(err) {
      throw new Error('Rascal config error: ', err.message)
    }
    ```

4. After forwarding a message

    ```js
    broker.forward('p1', message, function(err, publication) {
      if (err) throw new Error('Rascal config error: ', err.message)
      publication.on('error', function(err, messageId) {
        console.error('Publisher error', err, messageId)
      })
    })
    ```

    ```js
    try {
      const publication = await broker.forward('p1', message)
      publication.on('error', function(err, messageId) {
        console.error('Publisher error', err, messageId)
      })
    } catch(err) {
      throw new Error('Rascal config error: ', err.message)
    }
    ```

## Installation
```bash
npm install rascal
```

## Configuration
Rascal provides what we consider to be sensible defaults (optimised for reliability rather than speed) for production and test environments.

```js
var rascal = require('rascal')
var definitions = require('./your-config.json')
var config = rascal.withDefaultConfig(definitions)
```
or
```js
var rascal = require('rascal')
var definitions = require('./your-test-config.json')
var config = rascal.withTestConfig(definitions)
```
We advise you to review these defaults before using them in an environment you care about.

### Vhosts

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
If you specify ```"namespace" :true``` Rascal will prefix the queues and exchanges it creates with a uuid. Alternatively you can specify your own namespace, ```"namespace": "foo"```. Namespaces are also if you want to use a single vhost locally but multiple vhosts in other environments.

#### connection
The simplest way to specify a connection is with a url
```json
{
  "vhosts": {
    "v1": {
      "connection": "amqp://guest:guest@example.com:5672/v1?heartbeat=10"
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
Any attributes you add to the "options" sub document will be converted to query parameters. Any attributes you add in the "socketOptions" sub document will be passed directly to amqplib's connect method (which hands them off to `net` or `tls`. Providing you merge your configuration with the default configuration ```rascal.withDefaultConfig(config)``` you need only specify the attributes you want to override
```json
{
  "vhosts": {
    "v1": {
      "connection": {
        "hostname": "example.com",
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
If you specify an array of connections instead of a single connection object Rascal will order then randomly at startup, and cycle through until it obtains a connection or exhausts all hosts.
```json
{
  "vhosts": {
    "v1": {
      "connections": [
        "amqp://guest:guest@example1.com:5672/v1?heartbeat=10",
        "amqp://guest:guest@example2.com:5672/v1?heartbeat=10",
        "amqp://guest:guest@example3.com:5672/v1?heartbeat=10"
      ]
    }
  }
}
```

#### Management connection configuration
**Please note: this functionality is mainly useful in test environments, since it does not create users or grant them permissions to vhosts**

The AMQP protocol doesn't support assertion or checking of vhosts, so Rascal uses the RabbitMQ management API to achieve a similar result. The `management` connection configuration is derived from defaults and the vhost connection, but can be explicitly specified as follows...
```json
{
  "vhosts": {
    "v1": {
      "connection": {
        "hostname": "example.com",
        "user": "bob",
        "password": "secret",
        "management": {
          "protocol": "https",
          "pathname": "prefix",
          "user": "admin",
          "password": "super-secret",
          "options": {
            "timeout": 1000,
          }
        }
      }
    }
  }
}
```
Rascal uses [request](https://github.com/request/request) under the hood, and any management options will be passed straight through. URL configuration is supported too.

```json
{
  "vhosts": {
    "v1": {
      "connections": [
        {
          "url": "amqp://guest:guest@example1.com:5672/v1?heartbeat=10",
          "management": "http://guest:guest@example1.com:15672"
        },
        {
          "url": "amqp://guest:guest@example2.com:5672/v1?heartbeat=10",
          "management": "http://guest:guest@example2.com:15672"
        },
        {
          "url": "amqp://guest:guest@example2.com:5672/v1?heartbeat=10",
          "management": "http://guest:guest@example2.com:15672"
        }
      ]
    }
  }
}
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
Rascal pools channels it uses for publishing messages. It creates a two pools per vhost - one for confirm channels, and other one for "regular" channels. Default maximum pool size for these is 1. If you think it is a limiting factor in your publishing code, the value can be changed through config.
```json
{
  "vhosts": {
    "v1": {
      "publicationChannelPools": {
        "regularPoolSize": 1,
        "confirmPoolSize": 1
      }
    }
  }
}
```

#### assert
The AMQP protocol doesn't support assertion or confirmation of vhosts, however the RabbitMQ management API does. By setting `assert` to `true` and specifying a management connection, you can automatically create the vhost if it does not exist.

#### check
The AMQP protocol doesn't support assertion or confirmation of vhosts, however the RabbitMQ management API does. By setting `check` to `true` and specifying a management connection, you can error if the vhost does not exist.

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
Refer to the [amqplib](http://www.squaremobius.net/amqp.node/doc/channel_api.html) documentation for further exchange options.

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
Refer to the [amqplib](http://www.squaremobius.net/amqp.node/doc/channel_api.html) documentation for further queue options.

#### bindings
You can bind exchanges to exchanges, or exchanges to queues.
```json
{
  "vhosts": {
    "v1": {
      "exchanges": {
        "e1": {
        }
      },
      "queues": {
        "q1": {
        }
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
        "e1": {
        }
      },
      "queues": {
        "q1": {
        }
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
        "q1": {
        }
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
broker.publish("p1", "some message")
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
      "autoCreated": true,
    },
    "v1/q1": {
      "vhost": "/",
      "queue": "q1",
      "autoCreated": true,
    }
  }
}
```

Rascal supports text, buffers and anything it can JSON.stringify. The ```broker.publish``` method is overloaded to accept a runtime routing key or options.

```js
broker.publish("p1", "some message", callback)
broker.publish("p1", "some message", "some.routing.key", callback)
broker.publish("p1", "some message", { routingKey: "some.routing.key", options: { messageId: "foo", "expiration": 5000 } })
```

```js
await broker.publish("p1", "some message")
await broker.publish("p1", "some message", "some.routing.key")
await broker.publish("p1", "some message", { routingKey: "some.routing.key", options: { messageId: "foo", "expiration": 5000 } })
```

The callback parameters are err (indicating the publication could not be found) and publication. Listen to the publication's "success" event to obtain confirmation that the message was successfully published (when using confirm channels) and the "error" event to handle errors. The "return" event will be emitted when the message was successfully published but not routed. It is possible to access the messageId from all handlers, either via the supplied messageId or the returned message itself (see below)

If you specify the "mandatory" option (or use Rascal's defaults) you can also listen for returned messages (i.e. messages that were not delivered to any queues)

```js
broker.publish("p1", "some message", function(err, publication) {
  if (err) throw err; // publication didn't exist
  publication.on("success", function(messageId) {
     console.log("Message id was: ", messageId)
  }).on("error", function(err, messageId) {
     console.error("Error was: ", err.message)
  }).on("return", function(message) {
     console.warn("Message was returned: ", message.properties.messageId)
  })
})
```

```js
try {
  const publication = await broker.publish("p1", "some message")
  publication.on("success", function(messageId) {
    console.log("Message id was: ", messageId)
  }).on("error", function(err, messageId) {
     console.error("Error was: ", err.message)
  }).on("return", function(messageId) {
     console.warn("Message was returned: ", message.properties.messageId)
  })
} catch (err) {
  // publication didn't exist
}
```

 One publish option you should be aware of is the "persistent". Unless persistent is true, your messages will be discarded when you restart Rabbit. Despite having an impact on performance Rascal sets this in it's default configuration.

Refer to the [amqplib](http://www.squaremobius.net/amqp.node/doc/channel_api.html) documentation for further exchange options.

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
If you would like to publish directly to a queue, but you don't know the queue name ahead of time, you can use the fact that [all queues are automatically bound to the default exchange](https://www.rabbitmq.com/tutorials/amqp-concepts.html#exchange-default) with the routing key which is the same as the queue name. The default exchange's name is the empty string.
```json
{
  "publications": {
    "p1": {
      "exchange": ""
    }
  },
  "queues": ["q1"],
  ...
}
```
You can then publish to the queue:
```
broker.publish('p1', 'content', 'q1', function(err, publication) { ... });
```

See the "default-exchange" in the examples directory for a full working example.

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
Sometimes you want to forward a message to a publication. This may be part of a shovel program for transferring messages between vhosts, or because you want to ensure a sequence in some workflow, but do not need to modify the original message. Rascal supports this via ```broker.forward```. The syntax is similar to ```broker.publish``` except from you pass in the original message you want to be forwarded instead of the message payload. If the publication or overrides don't specify a routing key, the original forwarding key will be maintained. The message will also be CC'd with an additional routingkey of ```<queue>.<routingKey>``` which can be useful for some retry scenarios.

```js
broker.forward("p1", message, overrides, function(err, publication) {
  if (err) throw err // publication didn't exist
  publication.on("success", function(messageId) {
     console.log("Message id was: ", messageId)
  }).on("error", function(err, messageId) {
     console.error("Error was: ", err.message)
  }).on("return", function(message) {
     console.warn("Message was returned: ", message.properties.messageId)
  })
})
```

```js
try {
  const publication = await broker.forward("p1", message, overrides)
  publication.on("success", function(messageId) {
     console.log("Message id was: ", messageId)
  }).on("error", function(err, messageId) {
     console.error("Error was: ", err.message)
  }).on("return", function(message) {
     console.warn("Message was returned: ", message.properties.messageId)
  })
} catch(err) {
  // publication didn't exist
}
```

**Since there is no native, transactional support for forwarding in amqplib, you are at risk of receiving duplicate messages when using ```broker.foward```**


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
broker.subscribe('s1', function(err, subscription) {
  if (err) throw err // subscription didn't exist
  subscription.on('message', function(message, content, ackOrNack) {
    // Do stuff with message
  }).on('error', function(err) {
    console.error('Subscriber error', err)
  })
})
```
```js
try {
  const subscription = await broker.subscribe('s1')
  subscription.on('message', function(message, content, ackOrNack) {
    // Do stuff with message
  }).on('error', function(err) {
    console.error('Subscriber error', err)
  })
} catch(err) {
  // subscription didn't exist
}
```
It's **very** important that you handle errors emitted by the subscriber. If not an underlying channel error will bubble up to the uncaught error handler and crash your node process.

Prior to Rascal 4.0.0 it was also **very** important not to go async between getting the subscription and listening for the message or error events. If you did, you risked leaking messages and not handling errors.

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
The ```broker.subscribe``` method also accepts an options parameter which will override options specified in config
```js
broker.subscribe("s1", { prefetch: 10, retry: false }, callback)
```
```js
await broker.subscribe("s1", { prefetch: 10, retry: false })
```
The arguments to the on message event handler are ```function(message, content, ackOrNack)```, where message is the raw message, the content (a buffer, text, or object) and an ackOrNack callback. This callback should only be used for messages which were not ```{ "options": { "noAck": true } }``` by the subscription configuration or the options passed to ```broker.subscribe```.

> As with publications, you can nest subscriptions inside the vhost block. Rascal creates default subscriptions for every queue so providing you don't need to specify any additional options you don't need to include a subscriptions block at all.

#### Invalid Messages
If rascal can't parse the content (e.g. the message had a content type of 'application/json' but the content was not JSON), it will emit an 'invalid_content' event
```js
broker.subscribe('s1', function(err, subscription) {
  if (err) throw err // subscription didn't exist
  subscription.on('message', function(message, content, ackOrNack) {
    // Do stuff with message
  }).on('error', function(err) {
    console.error('Subscriber error', err)
  }).on('invalid_content', function(err, message, ackOrNack)) {
    console.error('Invalid content', err)
    ackOrNack(err)
  })
})
```
```js
try {
  const subscription = await broker.subscribe('s1')
  subscription.on('message', function(message, content, ackOrNack) {
    // Do stuff with message
  }).on('error', function(err) {
    console.error('Subscriber error', err)
  }).on('invalid_content', function(err, message, ackOrNack)) {
    console.error('Invalid content', err)
    ackOrNack(err)
  })
} catch(err) {
  // subscription didn't exist
}
```
If the message has not been auto-acknowledged you should ackOrNack it. **If you do not listen for the invalid_content event rascal will nack the message (without requeue) and emit an error event instead, leading to message loss if you have not configured a dead letter exchange/queue**.


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
If your app crashes before acknowledging a message, the message will be rolled back. It is common for node applications to automatically restart, however if the crash was caused by something in the message content, it will crash and restart indefinitely, thrashing the host. Unfortunately RabbitMQ doesn't allow you to limit the number of redeliveries per message or provide a redelivery count. For this reason subscribers can be configured with a redelivery counter and will update the ```message.properties.headers.rascal.redeliveries``` header with the number of hits. If the number of redeliveries exceeds the subscribers limit, the subscriber will emit a "redeliveries_exceeded" event, and can be handled by your application. e.g.

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
    "counter": {
        "<counter name>": {
            "type": "<counter type>",
            "size": "1000",
        }
    }
}
```

```js
broker.subscribe('s1', function(err, subscription) {
  if (err) throw err // subscription didn't exist
  subscription.on('message', function(message, content, ackOrNack) {
    // Do stuff with message
  }).on('error', function(err) {
    console.error('Subscriber error', err)
  }).on('redeliveries_exceeded', function(err, message, ackOrNack)) {
    console.error('Redeliveries exceeded', err)
    ackOrNack(err)
  })
})
```
```js
try {
  const subscription = await broker.subscribe('s1')
  subscription.on('message', function(message, content, ackOrNack) {
    // Do stuff with message
  }).on('error', function(err) {
    console.error('Subscriber error', err)
  }).on('redeliveries_exceeded', function(err, message, ackOrNack)) {
    console.error('Redeliveries exceeded', err)
    ackOrNack(err)
  })
} catch(err) {
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
For messages which are not auto-acknowledged (the default) calling ```ackOrNack()``` with no arguments will acknowledge it. Calling ```ackOrNack(err, [options], [callback])``` will nack the message will trigger one of the Rascal's recovery strategies.

##### Nack (Reject or Dead Letter)
```js
ackOrNack(err, { strategy: 'nack' })
```
Nack causes the message to be discarded or routed to a dead letter exchange if configured.

##### Nack with Requeue
```js
ackOrNack(err, { strategy: 'nack', defer: 1000, requeue: true })
```
The defer option is not mandatory, but without it you are likely retry your message thousands of times a second. Even then requeueing is a inadequate strategy for error handling, since the message will be rolled back to the front of the queue and there is no simple way to detect how many times the message has been redelivered.

Dead lettering is a good option for invalid messages but with one major flaw - because the message cannot be modified it cannot be annotated with the error details. This makes it difficult to do anything useful with messages once dead lettered.

##### Republish
```js
ackOrNack(err, { strategy: 'republish', defer: 1000 })
```
An alternative to nacking to republish the message back to the queue it came from. This has the advantage that the message will be resent to the back of the queue, allowing other messages to be processed and potentially fixing errors relating to ordering.

Rascal keeps track of the number of republishes so you can limit the number of attempts. **Whenever you specify a number of attempts you should always chain a fallback strategy**, otherwise if the attempts are exceeded your message will be neither acked or nacked.
```js
ackOrNack(err, [
  { strategy: 'republish', defer: 1000, attempts: 10 },
  { strategy: 'nack' }
])
```
Rascal also annotates the message with detail of the error ```message.properties.headers.rascal.<queue>.error``` which can be useful if you eventually dead letter it.

Before using republish please consider the following:

1. Rascal will copy messages properties from the original message to the republished one. If you set an expiration time on the original message this will also be recopied, effectively resetting it.

2. Rascal will ack the original message after successfully publishing the copy. This does not take place in a distributed transaction so there is a potential of the original message being rolled back after the copy has been published (the dead-letter delay loop also suffers from this).

3. Rascal will republish original message using a confirm channel, if the publish fails, the original message will not be nacked (You should mitigate this by chaining recovery strategies).

4. Publishing to a queue has the effect of clearing message.fields.exchange and setting message.fields.routingKey to the queue name. This is problematic if you want to replublish to the queue you consumed the message from. Rascal can mitigate restoring the original values before the consumer receives the message.

##### Republish with immediate nack
As mentioned previously, dead lettering invalid messages is a good strategy with one flaw - since there is no way to modify the message you cannot annotate it with failure details. A solution to this is to republish with attempts = 1 and then nacking it to a dead letter exchange. The problem with this approach is that invalid messages will always be processed twice. To workaround this set immediateNack to true in the recovery options. This will instruct Rascal to nack the message immediately instead of emitting the 'message' event.
```js
ackOrNack(err, { strategy: 'republish', immediateNack: true })
```
If you ever want to resend the message to the same queue you will have to remove the ```properties.headers.rascal.<queue>.immediateNack``` header first.

##### Forward
Instead of republishing the message to the same queue you can forward it to a Rascal publication. You should read the section entitled [Forwarding messages](Forwarding_messages) to understand the risks of this.
```js
ackOrNack(err, { strategy: 'forward', publication: 'some_exchange'})
```
**Danger**
As with the Republish strategy, you can limit the number of foward attempts. Whenever you specify a number of attempts you should always chain a fallback strategy, otherwise if the attempts are exceeded your message will be neither acked or nacked.

Furthermore if the message is forwarded but cannot be routed (e.g. due to an incorrect binding), the message will be returned **after** Rascal receives a 'success' event from amqplib. Consequently the message will have been ack'd. Any subsequent fallback strategy which attempts to ack or nack the message will fail, and so the message may lost. The subscription will emit an error event under such circumstances.


```js
ackOrNack(err, [
  { strategy: 'forward', publication: 'some_exchange', defer: 1000, attempts: 10 },
  { strategy: 'nack' }
])
```
You can also override the publication options
```js
ackOrNack(err, [
  { strategy: 'forward', publication: 'some_exchange', options: { routingKey: 'custom.routing.key' } },
  { strategy: 'nack' }
])
```
One use of the forward recovery strategy is to send messages to a wait queue which will dead-letter them after a period of time. [Repeated dead lettering causes some versions of RabbitMQ to crash](https://github.com/rabbitmq/rabbitmq-server/issues/161). If you encounter this issue upgrade RabbitMQ or specify ```xDeathFix: true``` which will delete any x-death headers on the message before forwarding.

##### Ack
Acknowledges the message, guaranteeing that it will be discarded in the event you also have a dead letter exchange configured. Sometimes useful in automated tests or when chaining a sequence of other recovery strategies.
```js
ackOrNack(err, { strategy: 'ack' })
```
#### Chaining Recovery Strategies
By chaining Rascal's recovery strategies and leveraging some of RabbitMQs lesser used features such as message you can achieve some quite sophisticated error handling. A simple combination of republish and nack (with dead letter) will enable you to retry the message a maximum number of times before dead letting it.

```js
ackOrNack(err, [
  {
    strategy: 'republish',
    defer: 1000,
    attempts: 10
  }, {
    strategy: 'nack'
  }
])
```
Far more sophisticated strategies are achievable...
![Retry BackOff Fail](https://user-images.githubusercontent.com/229672/49589770-2359d080-f962-11e8-957e-8d5368561afd.png "Retry BackOff Fail")

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
broker.subscribe("s1", { prefetch: 10, retry: false }, callback)

// Retries without delay.
broker.subscribe("s1", { prefetch: 10, retry: true }, callback)

// Retries after a one second interval.
broker.subscribe("s1", { prefetch: 10, retry: { delay: 1000 } }, callback)
```

```js
// Does not retry. This will cause an error to be emitted which unhandled will crash your process. See [Subscriber Events](#subscriber-events)
await broker.subscribe("s1", { prefetch: 10, retry: false })

// Retries without delay.
await broker.subscribe("s1", { prefetch: 10, retry: true })

// Retries after a one second interval.
await broker.subscribe("s1", { prefetch: 10, retry: { delay: 1000 } })
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
}
```

### Cancelling subscriptions

You can cancel subscriptions as follows

```js
broker.subscribe('s1', function(err, subscription) {
  if (err) throw err // subscription didn't exist
  subscription.cancel(function(err) {
    console.err(err)
  })
})
```
```js
try {
  const subscription = await broker.subscribe('s1')
  await subscription.cancel()
} catch(err) {
  // subscription didn't exist or could not be cancelled
}
```

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
  "bindings": [
    "e1 -> q1",
    "e2[bk1, bk2] -> q2"
  ]
}
```
If you need to specify exchange, queue or binding parameters you can mix and match string and object configuration...
```json
{
  "exchanges": {
    "e1": {},
    "e2" : {
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

### Nuke, Purge and UnsubscribeAll
In a test environment it's useful to be able to nuke your setup between tests. The specifics will vary based on your test runner, but assuming you were using [Mocha](http://mochajs.org/)...
```js
afterEach(function(done) {
  broker.nuke(done)
})
```
```js
afterEach(async function() {
  await broker.nuke()
})
```
It can be costly to nuke between tests, so if you want the tear down to be quicker use the purge and unsubscribeAll.
```js
afterEach(function(done) {
  async.series([
    broker.unsubscribeAll,
    broker.purge
  ], done)
})

after(function(done) {
  broker.nuke(done)
})
```

```js
afterEach(async function() {
  await broker.unsubscribeAll()
  await broker.purge()
})

after(async function() {
  await broker.nuke()
})
```

### Bounce
Bounce disconnects and reinistialises the broker.
```js
beforeEach(function(done) {
  broker.bounce(done)
})
```
```js
beforeEach(async function() {
  await broker.bounce()
})
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
  "shovels": [
    "s1 -> p1"
  ]
}
```

## Running the tests
```bash
npm test
```
You'll need a RabbitMQ server running locally with default configuration. If that's too much trouble try installing [docker](https://www.docker.com/) and running the following
```
docker run -d -p 5672:5672 -p 15672:15672 dockerfile/rabbitmq
```

