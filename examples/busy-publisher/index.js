const Rascal = require('../..');
const config = require('./config');
const random = require('random-readable');

Rascal.Broker.create(Rascal.withDefaultConfig(config), (err, broker) => {
  if (err) throw err;

  broker.on('error', console.error);

  const stream = random
    .createRandomStream()
    .on('error', console.error)
    .on('data', (data) => {
      broker.publish('demo_pub', data, (err, publication) => {
        if (err) throw err;
        publication.on('error', console.error);
      });
    })
    .on('end', () => {
      console.log('end');
    });

  broker.on('busy', (details) => {
    console.log(Date.now(), `Pausing vhost: ${details.vhost} (mode: ${details.mode}, queue: ${details.queue}, size: ${details.size}, borrowed: ${details.borrowed}, available: ${details.available})`);
    stream.pause();
  });

  broker.on('ready', (details) => {
    console.log(Date.now(), `Resuming vhost: ${details.vhost} (mode: ${details.mode}, queue: ${details.queue}, size: ${details.size}, borrowed: ${details.borrowed}, available: ${details.available})`);
    stream.resume();
  });
});
