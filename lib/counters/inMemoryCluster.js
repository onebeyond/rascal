const cluster = require('cluster');
const inMemory = require('./inMemory');
const uuid = require('uuid').v4;
const Stashback = require('stashback');
const debug = 'rascal:counters:inMemoryCluster';

module.exports = {
  master: function master(options) {
    const workers = {};
    const counter = inMemory(options);

    function handleMessage(worker, message) {
      if (message.sender !== 'rascal-in-memory-cluster-counter' || message.cmd !== 'incrementAndGet') return;
      counter.incrementAndGet(message.key, (err, value) => {
        worker.send({
          sender: 'rascal-in-memory-cluster-counter',
          correlationId: message.correlationId,
          value: err ? 1 : value,
        });
      });
    }

    cluster
      .on('fork', (worker) => {
        workers[worker.id] = worker;
        worker.on('message', (message) => {
          handleMessage(worker, message);
        });
      })
      .on('disconnect', (worker) => {
        delete workers[worker.id];
      })
      .on('exit', (worker) => {
        delete workers[worker.id];
      });
  },
  worker: function worker(options) {
    if (!cluster.isWorker) throw new Error("You cannot use Rascal's in memmory cluster counter outside of a cluster");
    if (!options) return worker({});
    const timeout = options.timeout || 100;
    const stashback = Stashback({ timeout });

    process.on('message', (message) => {
      if (message.sender !== 'rascal-in-memory-cluster-counter') return;
      stashback.unstash(message.correlationId, (err, cb) => {
        err ? cb(null, 1) : cb(null, message.value);
      });
    });

    return {
      incrementAndGet(key, cb) {
        const correlationId = uuid();
        stashback.stash(
          correlationId,
          (err, value) => {
            err ? cb(null, 1) : cb(null, value);
          },
          (err) => {
            if (err) return cb(null, 1);
            process.send({
              sender: 'rascal-in-memory-cluster-counter',
              correlationId,
              cmd: 'incrementAndGet',
            });
          }
        );
      },
    };
  },
};
