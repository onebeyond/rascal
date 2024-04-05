const Rascal = require('../..');
const config = require('./publisher-config');
const random = require('random-readable');
const max = parseInt(process.argv[2], 10) || Infinity;

Rascal.Broker.create(Rascal.withDefaultConfig(config), (err, broker) => {
  if (err) throw err;

  broker.on('error', console.error);

  let count = 0;

  const stream = random
    .createRandomStream()
    .on('error', console.error)
    .on('data', (data) => {
      broker.publish('demo_pub', data, (err, publication) => {
        if (err) throw err;
        else if (count >= max) stream.destroy();
        else count++;
        publication.on('error', console.error);
      });
    })
    .on('close', () => {
      console.log(`Published ${count} messages`)
      broker.shutdown();
    });    ;

  broker.on('busy', (details) => {
    console.log(Date.now(), `Pausing vhost: ${details.vhost} (mode: ${details.mode}, queue: ${details.queue}, size: ${details.size}, borrowed: ${details.borrowed}, available: ${details.available})`);
    stream.pause();
  });

  broker.on('ready', (details) => {
    console.log(Date.now(), `Resuming vhost: ${details.vhost} (mode: ${details.mode}, queue: ${details.queue}, size: ${details.size}, borrowed: ${details.borrowed}, available: ${details.available})`);
    stream.resume();
  });
});
