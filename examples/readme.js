var rascal = require('..')
var _ = require('lodash').runInContext().mixin({ 'defaultsDeep': require('merge-defaults') })
var definitions = require('./definitions.json')

var config = _.defaultsDeep(definitions, rascal.defaults)

rascal.Broker.create(config, function(err, broker) {
  if (err) console.error(err.message) & process.exit(1)
  broker.subscribe('s1', function(err, message, content, next) {
    console.log(content)
    next()
  })
  setInterval(function() {
        broker.publish('p1', 'This is a test message')
    }, 100).unref()
})