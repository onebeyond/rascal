var Rascal = require('../..');
var cluster = require('cluster');

if (cluster.isMaster) {
  Rascal.counters.inMemoryCluster.master();
  cluster.fork();
  cluster.on('exit', function () {
    cluster.fork();
  });
} else {
  require('./index');
}
