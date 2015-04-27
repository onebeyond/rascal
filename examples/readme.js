var rascal = require('..')
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