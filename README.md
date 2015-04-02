# Rascal

Rascal is a config driven wrapper around amqplib with mostly* safe defaults

## tl;dr

```javascript
var rascal = require('..')
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

