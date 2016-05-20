# Rascal

Rascal is a config driven wrapper around [amqplib](https://www.npmjs.com/package/amqplib) with [mostly safe](#caveats) defaults

## Recent changes
Prior to version 0.11 rascal modified the supplied config object, by expanding shortcut notation and pulling subscriptions and publications out of their vhosts block. This could lead to some hard to diagnose bugs in testsuites that created and nuked the broker multiple times. From 0.11 onwards the original config object is left intact, and a frozen version of the modified config available from ```broker.config```

We made the redelivery counter pluggable and added an implementation designed to work with [clustering](https://nodejs.org/api/cluster.html), so as to survive worker death. See the [Dealing With Redeliveries](#dealing-with-redeliveries) section for more details.

## tl;dr
See the [examples](https://github.com/guidesmiths/rascal/tree/master/examples)

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

* Rascal deliberately uses a new channel per publish operation. This is because any time a channel operation encounters an error, the channel becomes unusable and must be replaced. In an asynchronous environment such as node you are likely to have passed the channel reference to multiple callbacks, meaning that for every channel error, multiple publish operations will fail. The negative of the new channel per publish operation, is a little extra overhead and the chance of busting the maxium number of channels (the default is 65K). We urge you to test Rascal with realistic peak production loads to ensure this isn't the case.

* There are two situations when Rascal will nack a message without requeue, leading to potential data loss.
  1. When it is unable to parse the message content and the subscriber has no 'invalid_content' listener
  2. When the subscriber's (optional) redelivery limit has been exceeded and the subscriber has no 'redeliveries_exceeded' listener

The reason Rascal nacks the message is because the alternative is to rollback and retry the message in an infinite tight loop. This can DDOS your application and cause problems for your infrastructure. Providing you have correctly configured dead letter queues and/or listen to the "invalid_content" and "redeliveries_exceeded" subscriber events Rascal your messages should be safe.

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

#### Cluster Connections
If you specify an array of connections instead of a single connection object Rascal will pick at Random
```json
{
  "vhosts": {
    "v1": {
      "connection": [
        {
          "url":  "amqp://guest:guest@example1.com:5672/v1?heartbeat=10"
        },
        {
          "url":  "amqp://guest:guest@example2.com:5672/v1?heartbeat=10"
        },
        {
          "url":  "amqp://guest:guest@example3.com:5672/v1?heartbeat=10"
        }
      ]
    }
  }
}

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
```javascript
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
> To save you entering the vhost you can nest publications inside the vhost block.

Rascal supports text, buffers and anything it can JSON.stringify. The ```broker.publish``` method is overloaded to accept a runtime routing key or options.

```javascript
broker.publish("p1", "some message", callback)
broker.publish("p1", "some message", "some.routing.key", callback)
broker.publish("p1", "some message", { routingKey: "some.routing.key", options: { "expiration": 5000 } })

```
The callback parameters are err (indicating the publication could not be found) and publication. Listen to the publication's "success" event to obtain the Rascal generated message id and the "error" event to handle errors. If you specify the "mandatory" option (or use Rascal's defaults) you can also listen for returned messages (i.e. messages that were not delivered to any queues)
```javascript
broker.publish("p1", "some message", function(err, publication) {
  publication.on("success", function(messageId) {
     console.log("Message id was", messageId)
  }).on("error", function(err) {
     console.error("Error was", err.message)
  }).on("return", function(message) {
     console.warn("Message %s was returned", messageId)
  })
})
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

#### Forwarding messages
Sometimes you want to forward a message to a publication. This may be part of a shovel program for transferming messages between vhosts, or because you want to ensure a sequence in some workflow, but do not need to modify the original message. Rascal supports this via ```broker.forward```. The syntax is similar to ```broker.publish``` except from you pass in the original message you want to be forwarded instead of the message payload. If the publication or overrides don't specify a routing key, the original forwarding key will be maintained. The message will also be CC'd with an additional routingkey of ```<queue>.<routingKey>``` which can be useful for some retry scenarios.

```javascript
broker.forward("p1", message, overrides, function(err, publication) {
  publication.on("success", function(messageId) {
     console.log("Message id was", messageId)
  }).on("error", function(err) {
     console.error("Error was", err.message)
  }).on("return", function(message) {
     console.warn("Message %s was returned", messageId)
  })
})
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

It's also **very** important not to go async between getting the subscription and listening for the message or error events. If you do, you risk leaking messages and not handling errors.

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

#### Invalid Messages
If rascal can't parse the content (e.g. the message had a content type of 'application/json' but the content was not JSON), it will emit an 'invalid_content' event
```javascript
broker.subscribe('s1', function(err, subscription) {
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
If the message has not been auto-acknowledged you should ackOrNack it. **If you do not listen for the invalid_content event rascal will nack the message (without requeue) and emit an error event instead, leading to message loss if you have not configured a dead letter exchange/queue**.

#### Dealing With Redeliveries
If your node app crashes before acknowledging a message, the message will be rolled back. This will cause a tight infinite loop if there was something wrong with the content of message which caused the crash. Unfortunately RabbitMQ doesn't allow you to limit the number of redeliveries per message or provide a redelivery count. For this reason subscribers can be configured with a message id cache and will update the ```message.properties.headers.rascal.redeliveries``` header with the number of hits. If the number of redeliveries exceeds the subscribers limit, the subscriber will emit a "redeliveries_exceeded" event, and can be handled by your application.

```json
"subscriptions": {
    "s1": {
        "vhost": "/",
        "queue": "q1",
        "redeliveries": {
            "limit": 10,
            "cache": "inMemory"
        }
    }
},
"redeliveries": {
    "cache": {
        "inMemory": {
            "size": "1000"
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
  }).on('redeliveries_exceeded', function(err, message, ackOrNack)) {
    console.error('Redeliveries Exceeded', err)
    ackOrNack(err)
  })
})
```
If the message has not been auto-acknowdelged you should ackOrNack it. **If you do not listen for the redeliveries_exceeded event rascal will nack the message without requeue and emit an error event instead, leading to message loss if you have not configured a dead letter exchange/queue**.

Rascal only provides three cache implementations:

1. noCache - this is the default and does nothing.
2. inMemory - useful only for testing since if your node process crashes, the cache will be vaporised too
3. inMemoryCluster - like the inMemory, but since the cache resides in the master it survives worker crashes.

Of the three only inMemoryCluster is useful in production, and then only if you are using [clustering](https://nodejs.org/api/cluster.html). See the [advanced example](https://github.com/guidesmiths/rascal/tree/master/examples/advanced) for how to configure it.

#### Implementing your own cache
If your application is not clustered, but you still want to protect yourself from redeliveries, you need to implement your own cache backed by something like redis. In times of high message volumes the cache will be hit hard so you should make sure it's fast and resilient to failure/slow responses from the underlying store.

A basic redis based implementation would look like this...
```js
var redis = require('redis')

module.exports = function() {

    var cache = redis.createClient('redis')

    return {
        incrementAndGet: function(key, next) {
            cache.incr(key, function(err, redeliveries) {
                if (err) console.warn(err.message)
                next(null, redeliveries || 1)
            })
        }
    }
}
```
The above should not be used in production since it does not short-circuit on timeouts or connection failures.

#### Message Acknowledgement and Recovery Strategies
For messages which are not auto-acknowledged (the default) calling ```ackOrNack()``` with no arguments will acknowledge it. Calling ```ackOrNack(err, [options], [callback])``` will nack the message will trigger one of the Rascal's recovery strategies.

##### Nack (Reject or Dead Letter)
```javascript
ackOrNack(err, { strategy: 'nack' })
```
Nack causes the message to be discarded or routed to a dead letter exchange if configured.

##### Nack with Requeue
```javascript
ackOrNack(err, { strategy: 'nack', defer: 1000, requeue: true })
```
The defer option is not mandatory, but without it you are likely retry your message thousands of times a second. Even then requeueing is a inadequate strategy for error handling, since the message will be rolled back to the front of the queue and there is no simple way to detect how many times the message has been redelivered.

Dead lettering is a good option for invalid messages but with one major flaw - because the message cannot be modified it cannot be annotated with the error details. This makes it difficult to do anything useful with messages once dead lettered.

##### Republish
```javascript
ackOrNack(err, { strategy: 'republish', defer: 1000 })
```
An alternative to nacking to republish the message back to the queue it came from. This has the advantage that the message will be resent to the back of the queue, allowing other messages to be processed and potentially fixing errors relating to ordering.

Rascal keeps track of the number of republishes so you can limit the number of attempts. **Whenever you specify a number of attempts you should always chain a fallback strategy**, otherwise if the attempts are exceeded your message will be neither acked or nacked.
```javascript
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


```javascript
ackOrNack(err, [
  { strategy: 'forward', publication: 'some_exchange', defer: 1000, attempts: 10 },
  { strategy: 'nack' }
])
```
You can also override the publication options
```javascript
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

```javascript
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
![Retry BackOff Fail](https://cloud.githubusercontent.com/assets/229672/7668701/78071946-fc3e-11e4-8f34-67fc2db1dada.png "Retry BackOff Fail")

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
              "cache": {
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

  subscription.cancel(function(err) {
    console.err(err)
  })
})
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

### Nuke
In a test environment it's useful to be able to nuke your setup between tests. The specifics will vary based on your test runner, but assuming you were using [Mocha](http://mochajs.org/)...
```javascript
afterEach(function(done) {
    broker.nuke(done)
})
```

### Bounce
Bounce disconnects and reinistialises the broker.
```javascript
beforeEach(function(done) {
    broker.bounce(done)
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

