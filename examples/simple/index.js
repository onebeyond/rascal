var Rascal = require('../..');
var config = require('./config');

Rascal.Broker.create(Rascal.withDefaultConfig(config), function (err, broker) {
  if (err) throw err;

  broker.subscribe('demo_sub', function (err, subscription) {
    if (err) throw err;
    subscription.on('message', function (message, content, ackOrNack) {
      console.log(content);
      ackOrNack();
    });
    subscription.on('error', console.error);
    subscription.on('cancel', console.warn);
  });
  broker.on('error', console.error);

  setInterval(function () {
    broker.publish('demo_pub', new Date().toISOString() + ': hello world', function (err, publication) {
      if (err) throw err;
      publication.on('error', console.error);
    });
  }, 1000);
});
