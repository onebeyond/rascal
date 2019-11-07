const Rascal = require('../..')
const config = require('./config')
const random = require('random-readable');

Rascal.Broker.create(Rascal.withDefaultConfig(config), function(err, broker) {
  if (err) throw err

  const stream = random.createRandomStream()
    .on('error', console.error)
    .on('data', data => {
      broker.publish('demo_pub', data, function(err, publication) {
        if (err) throw err
        publication.on('error', console.error)
      })
    })
    .on('end', () => {
      console.log('end');
    })

  broker.on('busy', function(vhost) {
    console.log(Date.now(), `Pausing vhost: ${vhost}`);
    stream.pause();
  });

  broker.on('ready', function(vhost) {
    console.log(Date.now(), `Resuming vhost: ${vhost}`);
    stream.resume();
  });
})


