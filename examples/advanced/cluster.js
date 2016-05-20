var Rascal = require('../..')
var cluster = require('cluster')

if (cluster.isMaster) {
    Rascal.counters.inMemoryCluster.master()
    cluster.fork()
    cluster.on('exit', cluster.fork)
} else {
    require('./index')
}