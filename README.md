# Rascal

Rascal is a config driven wrapper around [amqplib](https://www.npmjs.com/package/amqplib) with [mostly safe](#caveats) defaults

## tl;dr

```javascript
var rascal = require('rascal')
var definitions = require('./definitions.json')

var config = rascal.withDefaultConfig(definitions)

rascal.createBroker(config, function(err, broker) {
    if (err) bail(err)

    broker.subscribe('s1', function(err, subscription) {
        if (err) bail(err)

        subscription.on('message', function(message, content, ackOrNack) {
            console.log(content)
            ackOrNack()
        }).on('error', bail)
    })
    setInterval(function() {
        broker.publish('p1', 'This is a test message', function(err, publication) {
            if (err) bail(err)
        })
    }, 100).unref()
})

function bail(err) {
    console.error(err)
    process.exit(1)
}
```

definitions.json
```json
{
  "vhosts": {
    "/": {
      "exchanges": {
        "e1": {}
      },
      "queues": {
        "q1": {}
      },
      "bindings": {
        "b1": {
          "source": "e1",
          "destination": "q1"
        }
      }
    }
  },
  "publications": {
    "p1": {
      "exchange": "e1"
    }
  },
  "subscriptions": {
    "s1": {
      "queue": "q1"
    }
  }
}
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
* Rascal currently implements only a small subset of the [amqplib api](http://www.squaremobius.net/amqp.node/doc/channel_api.html). It was written with a strong bias towards moderate volume pub/sub systems for a project with some quite agressive timescales. If you need one of the missing api calls, then your best approach is to submit a [PR](https://github.com/guidesmiths/rascal/pulls).

* Rascal deliberately uses a new channel per publish operation. This is because any time a channel operation encounters an error, the channel becomes unusable and must be replaced. In an asynchronous environment such as node you are likely to have passed the channel reference to multiple callbacks, meaning that for every channel error, multiple publish operations will fail. The negative of the new channel per publish operation, is a little extra overhead and the chance of busting the maxium number of channels (the default is 65K). We urge you to test Rascal with realistic peak production loads to ensure this isn't the case.

* Rascal has plenty of automated tests, but is by no means battle hardened (yet).

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
        subscription.on('message', function(message, content, ackOrNack) {
          // Do stuff with message
        }).on('error', function(err) {
          console.error('Subscriber error', err)
        })
    ```
3. After publishing a message

    ```js
      broker.publish('p1', 'some text', function(err, publication) {
        publication.on('error', function(err) {
          console.error('Publisher error', err)
        })
      })
    ```
4. After forwarding a message

    ```js
      broker.forward('p1', message, function(err, publication) {
        publication.on('error', function(err) {
          console.error('Publisher error', err)
        })
      })
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
          "connection": {
              "url":  "amqp://guest:guest@example.com:5672/v1?heartbeat=10"
          }
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
              }
          }
      }
  }
}
```
Any attributes you add to the "options" sub document will be converted to query parameters. Providing you merge your configuration with the default configuration ```rascal.withDefaultConfig(config)``` you need only specify the attributes you want to override
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
                  "delay": 1000
              }
          }
      }
  }
}
```

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
      "exchange": "e1",
      "vhost": "v1",
      "routingKey": "foo"
    }
  }
}
```
```javascript
broker.publish("p1", "some message")
```
If you prefer to send messages to a queue
```json
{
  "publications": {
    "p1": {
      "exchange": "e1",
      "vhost": "v1"
    }
  }
}
```
Rascal supports text, buffers and anything it can JSON.stringify. When publish a message Rascal sets the contentType message property to "text/plain", "application/json" (it uses this when reading the message too). The ```broker.publish``` method is overloaded to accept a runtime routing key or options.

```javascript
broker.publish("p1", "some message", callback)
broker.publish("p1", "some message", "some.routing.key", callback)
broker.publish("p1", "some message", { routingKey: "some.routing.key", options: { "expiration": 5000 } })

```
The callback parameters are err (indicating the publication could not be found) and publication. Listen to the publication's "success" event to obtain the Rascal generated message id and the "error" event to handle errors
```javascript
broker.publish("p1", "some message", function(err, publication) {
  publication.on("success", function(messageId) {
     console.log("Message id was", messageId)
  }).on("error", function(err) {
     console.error("Error was", err.message)
  })
})
```

 On publish option you should be aware of is the "persistent". Unless persistent is true, your messages will be discarded when you restart Rabbit. Despite having an impact on performance Rascal sets this in it's default configuration.

Refer to the [amqplib](http://www.squaremobius.net/amqp.node/doc/channel_api.html) documentation for further exchange options.

**It's important to realise that even though publication emits a "success" event, this offers no guarantee that the message has been sent UNLESS you use a confirm channel**.
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

#### Forwarding messages
Sometimes you want to forward a message to a publication. This may be part of a shovel program for transferming messages between vhosts, or because you want to ensure a sequence in some workflow, but do not need to modify the original message. Rascal supports this via ```broker.forward```

```javascript
broker.forward("p1", message, function(err, publication) {
  publication.on("success", function(messageId) {
     console.log("Message id was", messageId)
  }).on("error", function(err) {
     console.error("Error was", err.message)
  })
})
```
The syntax is similar to broker.publish apart from you pass in the original message you want to be forwarded instead of the message payload. Rascal will copy the original message properties to the forwarded message and decorate the message the following headers:

```json
{
  "rascal": {
    "forwarded": true,
    "originalExchange": "original:exchange"
  }
}
```
**Since there is no native, transactional support for forwarding in amqplib, you are at risk of receiving duplicate messages if you use ```broker.foward```**


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
```javascript
broker.subscribe('s1', function(err, subscription) {
  subscription.on('message', function(message, content, ackOrNack) {
    // Do stuff with message
  }).on('error', function(err) {
    console.error('Subscriber error', err)
  })
})
```
It's **very** important that you handle errors emitted by the subscriber. If not an underlying channel error will bubble up to the uncaught error handler and crash your node process.

It's also **very** important not to go async between getting the subscriptio and listening for the message or error events. If you do, you risk leaking messages and not handling errors.

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
```javascript
broker.subscribe("s1", { prefetch: 10, retry: false }, callback)
```
The arguments to the on message event handler are ```function(message, content, ackOrNack)```, where message is the raw message, the content (a buffer, text, or object) and an ackOrNack callback. This callback should only be used for messages which were not ```{ "options": { "noAck": true } }``` by the subscription configuration or the options passed to ```broker.subscribe```.

#### ackOrNack

For messages which are not auto-acknowledged (the default) calling ```ackOrNack()``` with no arguments will acknowledge it. Calling ```ackOrNack(err, [options], [callback])``` will nack the message will trigger one of the following recovery strategies. All strategies accept a 'defer' parameter which can be used to avoid tight loops, e.g.
```javascript
ackOrNack(err, { stategy: 'nack', defer: 1000 })
```

##### Nack

```javascript
ackOrNack(err, { strategy: 'nack' })
```
Nack causes the message to be discarded or routed to a dead letter exchange if configured. By configuring a dead letter queue to dead letter back to the original exchange after a queue level ttl you can retry messages after a short delay. You can limit the number retires by specifying
```javascript
ackOrNack(err, { strategy: 'nack', options: { attempts: 5 }})
```

If you want prefer to requeue the message call
```javascript
ackOrNack(err, { strategy: 'nack', defer: 1000, options: { requeue: true } })
```
The defer option is not mandatory, but without it you are likely retry your message thousands of times a second. Even then requeueing is a inadequate strategy for error handling, since the message will be rolled back to the front of the queue and there is no simple way to detect how many times the message has been redelivered.

#### Republish
```javascript
ackOrNack(err, { strategy: 'republish' })
```
An alternative to nacking to republish the message back to the queue it came from. This can be used as a 'poor-mans' version of the dead-letter delay loop, however it is not recommended due to the following issues:

1. Rascal will copy messages properties from the original message to the republished one. If you set an expiration time on the original message this will also be recopied, effectively resetting it.

2. Rascal will ack the original message after successfully publishing the copy. This does not take place in a distributed transaction so there is a potential of the original message being rolled back after the copy has been published (the dead-letter delay loop also suffers from this).

3. Rascal will republish original message using a confirm channel, if the publish fails, the original message will not be nacked (You should mitigate this by chaining recovery strategies).

4. Publishing to a queue has the effect of clearing message.fields.exchange and setting message.fields.routingKey to the queue name. This is problematic if you want to replublish to the queue you consumed the message from. Rascal can mitigate restoring the original values before the consumer receives the message.

Instead of republish the message to the same queue you can route it to a different exchange using the same options availble to ```broker.publish```
```js
ackOrNack(err, { strategy: 'republish', options: { exchange: 'ex1', routingKey: 'foo' } })
```
However this is also a dumb thing to do as the same results can be achieve using dead letter queues. Where the republish strategy is useful is when you chain it to a dead-letter retry queue...

#### Chaining Recovery Strategies
```javascript
ackOrNack(err, [
  {
    strategy: 'nack',
    options: {
      attempts: 10
    }
  }, {
    strategy: 'republish',
    options: {
      vhost: '/'
      exchange: 'failure'
    }
  }, {
    strategy: 'nack',
    defer: 1000,
    options: {
      requeue: true
  }
])
```
Assuming that the queue the message was read from was configured with a dead letter exchange that was bound to a dead letter queue with a TTL of 1 minute, configured to dead letter expired messages to the original exchange, here's what would happen...

1. Message is routed to the consumers queue
2. The consumer encounters an error and nacks the messages with the above configuration
3. Message message is routed to the dead letter queue
4. Message sits on the dead leter queue for 1 minute
5. Message is routed back to the original exchange, and deliered to the consmer queue
6. Repeat steps 1-5 10 times
7. Message is republished to the failure queue where a human being will have to deal with it
8. If the message fails to be republished, it will be rolled back to the consumer queue at 1 second intervals until successfully republished


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
          "routingKey": "",
          "options": {
              "persistent": true
          }
      },
      "subscriptions": {
          "vhost": "/",
          "prefetch": 10,
          "retry": {
              "delay": 1000
          }
      }
  }
}
```

### Cancelling subscriptions

You can cancel subscriptions as follows

```js
broker.subscribe('s1', function(err, subscription) {

  subscription.cancel(function(err) {
    console.err(err)
  })
})
```
## Bonus Features

### Nuke
In a test environment it's useful to be able to nuke your setup between tests. The specifics will vary based on your test runner, but assuming you were using [Mocha](http://mochajs.org/)...
```javascript
afterEach(function(done) {
    broker ? broker.nuke(done) : done()
})
```

### Bounce
Bounce disconnects and reinistialises the broker. We're hoping to use it for some automated reconnection tests

### Running the tests
```bash
npm test
```
You'll need a RabbitMQ server running locally with default configuration. If that's too much trouble try installing [docker](https://www.docker.com/) and running the following
```
docker run -d -p 5672:5672 -p 15672:15672 dockerfile/rabbitmq
```

