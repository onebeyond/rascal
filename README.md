# Rascal

Rascal is a config driven wrapper around amqplib with [mostly safe](#Caveats) defaults

## tl;dr

```javascript
var rascal = require('rascal')
var definitions = require('./definitions.json')

var config = rascal.withDefaultConfig(definitions)

rascal.createBroker(config, function(err, broker) {
  if (err) console.error(err.message) & process.exit(1)
  broker.subscribe('s1', function(err, message, content, next) {
    console.log(content)
    next()
  })
  setInterval(function() {
    broker.publish('p1', 'This is a test message')
  }, 100).unref()
})
```

definitions.json
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
          "destination": "q1"
        }
      }
    }
  },
  "publications": {
    "p1": {
      "exchange": "e1",
      "vhost": "v1"
    }
  },
  "subscriptions": {
    "s1": {
      "queue": "q1",
      "vhost": "v1"
    }
  }
}
```
## About
Rascal is a wrapper for the excellent [amqplib](https://www.npmjs.com/package/amqplib). One of the best things about amqplib is that it doesn't make assumptions about how you use it. Another is that it doesn't attempt to abstract away [AMQP Concepts](https://www.rabbitmq.com/tutorials/amqp-concepts.html). As a result the library offers a great deal of control and flexibility, but the onus is on you adopt appropriate patterns and configuration. You need to be aware that:

* messages are not persistent by default and will be lost if your broker restarts
* messages that crash your app will be infinitely retried
* without prefetch a sudden flood of messages may bust your event loop 
* dropped connections and borked channels will not be automatically recoved
 
Rascal seeks to solve these problems.

## Caveats
* Rascal currently implements only a small subset of the [amqplib api](http://www.squaremobius.net/amqp.node/doc/channel_api.html). It was written with a strong bias towards moderate volume pub/sub systems for a project with some quite agressive timescales. If you need one of the missing api calls, then your best approach is send us a [PR](https://github.com/guidesmiths/rascal/pulls).

* Rascal deliberately uses a new channel per publish operation. This is because any time an channel operation encounters an error, the channel becomes unusable, and must be replaced. In an asynchronous environment such as node you are likely to have passed the channel reference to multiple callbacks, meaning that for every channel error, multiple publish operations will fail. The negative of the new channel per publish operation, is a little extra overhead and the chance of busting the maxium number of channels (the default is 65K). We urge you to test Rascal with realistic peak production loads to ensure this isn't the case. 

* Rascal has plenty of automated tests, but is by no means battle hardened (yet).

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
Running automated tests against shared queues and exchanges is problematic. Messages left over from a previous test run can cause assertions to fail. Rascal has several strategies which help you cope with this problem, one of which is to namespace your queues and exchange. By specifying ```"namespace" :true``` Rascal will prefix the queues and exchanges it creates with a uuid. Alternatively you can specify your own namespace, ```"namespace": "foo"```. Namespaces are also if you want to use a single vhost locally but multiple vhosts in other environments.

#### connection
The simplest way to specify a connection is with a url
```json
"vhosts": {
    "v1": {
        "connection": {
            "url":  "amqp://guest:guest@example.com:5672/v1?heartbeat=10"
        }
    }
}
```
If this doesn't work for you, then you can specify the individual connection details
```json
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
```
Any attributes you add to the "options" sub document will be converted to query parameters. Providing you merge your configuration with the default configuration ```rascal.withDefaultConfig(config)``` you need only specify the attributes you need to override
```json
"vhosts": {
    "v1": {
        "connection": {
            "hostname": "example.com",
            "user": "bob",
            "password": "secret",
            "vhost": "v1"
        }
    }
}
```
Rascal also supports automatic connection retries. It's enabled in the default config, or you want enable it specifically as follows.
```
"vhosts": {
    "v1": {
        "connection": {
            "retry": {
                "delay": 1000
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
```

##### type
Declares the exchange type. Must be one of direct, topic, headers or fanout. The default configuration sets the exchange type to "topic" unless overriden.

##### options
Define any further configuration in an options block
```json
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
```
Refer to the excellent [amqplib](http://www.squaremobius.net/amqp.node/doc/channel_api.html) documentation for further exchange options.

#### Queues

##### assert
Setting assert to true will cause Rascal to create the queue on initialisation. If the queue already exists and has the same configuration (durability, etc) everything will be fine, however if the existing queue has a different configuration an error will be returned. Assert is enabled in the default configuration.

##### check
If you don't want to create queues on initialisation, but still want to validate that they exist set assert to false and check to true
```json
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
```

#### purge
Enable to purge the queue during initialisation. Useful when running automated tests
```json
"vhosts": {
    "v1": {
        "queues": {
            "q1": {
                "purge": true
            }
        }
    }
}
```

##### options
Define any further configuration in an options block
```json
"queues": {
    "q1": {
        "options": {
            "durable": false,
            "exclusive": true
        }
    }
}
```
Refer to the excellent [amqplib](http://www.squaremobius.net/amqp.node/doc/channel_api.html) documentation for further queue options.
