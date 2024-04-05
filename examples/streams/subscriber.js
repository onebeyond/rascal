const Rascal = require('../..');
const config = require('./subscriber-config');
const offset = parseInt(process.argv[2], 10) || 'first';

Rascal.Broker.create(Rascal.withDefaultConfig(config), (err, broker) => {
  if (err) throw err;

  broker.on('error', console.error);

  const overrides = {
    options: {
      arguments: {
        'x-stream-offset': offset
      }
    }
  };

  broker.subscribe('demo_sub', overrides, (err, subscription) => {
    if (err) throw err;
    subscription.on('message', (message, content, ackOrNack) => {
      if (message === null) return console.log('Received null message');
      console.log(`Received message: ${message.properties.headers['x-stream-offset']}`)
      ackOrNack();
    });
  });
});
