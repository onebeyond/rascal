var cluster = require('cluster')
var inMemory = require('./inMemory')
var uuid = require('uuid').v4
var Stashback = require('stashback')
var debug = 'rascal:counters:inMemoryCluster'

module.exports = {
    master: function master(options) {
        var workers = {}
        var counter = inMemory(options)

        function handleMessage(worker, message) {
            if (message.sender !== 'rascal-in-memory-cluster-counter' || message.cmd !== 'incrementAndGet') return
            counter.incrementAndGet(message.key, function(err, value) {
                worker.send({ sender: 'rascal-in-memory-cluster-counter', correlationId: message.correlationId, value: err ? 1 : value })
            })
        }

        cluster.on('fork', function(worker) {
            workers[worker.id] = worker
            worker.on('message', function(message) {
                handleMessage(worker, message)
            })
        }).on('disconnect', function(worker) {
            delete workers[worker.id]
        }).on('exit', function(worker) {
            delete workers[worker.id]
        })
    },
    worker: function worker(options) {

        if (!options) return worker({})
        var timeout = options.timeout || 100
        var stashback = Stashback({ timeout: timeout })

        process.on('message', function(message) {
            if (message.sender !== 'rascal-in-memory-cluster-counter') return
            stashback.unstash(message.correlationId, function(err, cb) {
                err ? cb(null, 1) : cb(null, message.value)
            })
        })

        return {
            incrementAndGet: function (key, cb) {
                var correlationId = uuid()
                stashback.stash(correlationId, function(err, value) {
                    err ? cb(null, 1) : cb(null, value)
                }, function(err) {
                    if (err) return cb(null, 1)
                    process.send({
                        sender: 'rascal-in-memory-cluster-counter',
                        correlationId: correlationId,
                        cmd: 'incrementAndGet'
                    })
                })
            }
        }
    }
}