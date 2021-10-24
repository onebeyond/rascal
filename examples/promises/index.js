var Rascal = require('../..');
var config = require('./config');

(async function () {
  try {
    const broker = await Rascal.BrokerAsPromised.create(Rascal.withDefaultConfig(config));
    broker.on('error', console.error);

    try {
      const subscription = await broker.subscribe('demo_sub');
      subscription
        .on('message', function (message, content, ackOrNack) {
          console.log(content);
          ackOrNack();
        })
        .on('error', console.error);
    } catch (err) {
      console.error(err);
    }

    setInterval(async function () {
      try {
        const publication = await broker.publish('demo_pub', new Date().toISOString() + ': hello world');
        publication.on('error', console.error);
      } catch (err) {
        console.error(err);
      }
    }, 1000);
  } catch (err) {
    console.error(err);
  }
})();
