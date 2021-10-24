var Rascal = require('../..');
var config = require('./config');

Rascal.Broker.create(Rascal.withDefaultConfig(config), function (err, broker) {
  if (err) throw err;

  broker
    .subscribe('demo_sub', function (err, subscription) {
      if (err) throw err;
      subscription
        .on('message', function (message, content, ackOrNack) {
          console.log(content);
          ackOrNack();
        })
        .on('error', console.error);
    })
    .on('error', console.error);

  setInterval(function () {
    broker.publish('demo_pub', new Date().toISOString() + ': hello world', 'demo_q', function (err, publication) {
      if (err) throw err;
      publication.on('error', console.error);
    });
  }, 1000);
});
