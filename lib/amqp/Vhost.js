const debug = require('debug')('rascal:Vhost');
const format = require('util').format;
const inherits = require('util').inherits;
const EventEmitter = require('events').EventEmitter;
const async = require('async');
const genericPool = require('generic-pool');
const tasks = require('./tasks');
const uuid = require('uuid').v4;
const _ = require('lodash');
const backoff = require('../backoff');
const setTimeoutUnref = require('../utils/setTimeoutUnref');

module.exports = {
  create(config, components, next) {
    new Vhost(config, components).init(next);
  },
};

inherits(Vhost, EventEmitter);

function Vhost(config, components) {
  const self = this;
  let connection;
  let connectionConfig;
  let regularChannelPool;
  let confirmChannelPool;
  const channelCreator = async.queue(createChannel, 1);

  const init = async.compose(tasks.closeChannel, tasks.applyBindings, tasks.purgeQueues, tasks.checkQueues, tasks.assertQueues, tasks.checkExchanges, tasks.assertExchanges, tasks.createChannel, tasks.createConnection, tasks.checkVhost, tasks.assertVhost);
  const connect = async.compose(tasks.createConnection);
  const purge = async.compose(tasks.closeConnection, tasks.closeChannel, tasks.purgeQueues, tasks.createChannel, tasks.createConnection);
  const nuke = async.compose(tasks.closeConnection, tasks.closeChannel, tasks.deleteQueues, tasks.deleteExchanges, tasks.createChannel, tasks.createConnection);
  let timer = backoff({});
  let paused = true;
  let shuttingDown = false;
  let reconnectTimeout;

  this.name = config.name;
  this.connectionIndex = 0;

  pauseChannelAllocation();

  this.init = function (next) {
    if (shuttingDown) {
      debug('Aborting initialisation. Vhost %s is shutting down.', self.name);
      return next();
    }

    debug('Initialising vhost: %s', self.name);
    pauseChannelAllocation();

    init(config, { connectionIndex: self.connectionIndex, components }, (err, config, ctx) => {
      if (err) return next(err);

      connection = ctx.connection;
      self.connectionIndex = ctx.connectionIndex;
      connectionConfig = ctx.connectionConfig;
      timer = backoff(ctx.connectionConfig.retry);

      attachErrorHandlers(config);
      forwardRabbitMQConnectionEvents();
      ensureChannelPools();
      resumeChannelAllocation();

      debug('vhost: %s was initialised with connection: %s', self.name, connection._rascal_id);

      self.emit('connect');
      self.emit('vhost_initialised', self.getConnectionDetails());

      return next(null, self);
    });
    return self;
  };

  this.forewarn = function (next) {
    debug('Forewarning vhost: %s about impending shutdown', self.name);
    pauseChannelAllocation();
    shuttingDown = true;
    channelCreator.resume();
    next();
  };

  this.shutdown = function (next) {
    debug('Shutting down vhost: %s', self.name);
    clearTimeout(reconnectTimeout);
    pauseChannelAllocation();
    drainChannelPools((err) => {
      if (err) return next(err);
      self.disconnect(next);
    });
  };

  this.nuke = function (next) {
    debug('Nuking vhost: %s', self.name);
    pauseChannelAllocation();
    drainChannelPools((err) => {
      if (err) return next(err);
      nuke(config, { connectionIndex: self.connectionIndex }, (err) => {
        if (err) return next(err);
        debug('Finished nuking vhost: %s', self.name);
        setImmediate(next);
      });
    });
  };

  this.purge = function (next) {
    debug('Purging vhost: %s', self.name);
    purge(config, { purge: true, connectionIndex: self.connectionIndex }, (err) => {
      if (err) return next(err);
      debug('Finished purging vhost: %s', self.name);
      setImmediate(next);
    });
  };

  this.bounce = function (next) {
    async.series([self.disconnect, self.init], (err) => {
      if (err) return next(err);
      debug('Finished bouncing vhost: %s', self.name);
      setImmediate(next);
    });
  };

  this.connect = function (next) {
    debug('Connecting to vhost: %s', self.name);
    connect(config, { connectionIndex: self.connectionIndex }, (err, config, ctx) => {
      return next(err, ctx.connection);
    });
  };

  this.disconnect = function (next) {
    debug('Disconnecting from vhost: %s', self.name);
    if (!connection) return next();
    connection.removeAllListeners();
    connection.on('error', (err) => {
      debug('Error disconnecting from %s. Original error was: %s', connectionConfig.loggableUrl, err.message);
    });
    connection.close((err) => {
      connection = undefined;
      next(err);
    });
  };

  this.getChannel = function (next) {
    channelCreator.push({ confirm: false }, next);
    debug('Requested channel. Outstanding channel requests: %d', channelCreator.length());
  };

  this.getConfirmChannel = function (next) {
    channelCreator.push({ confirm: true }, next);
    debug('Requested confirm channel. Outstanding channel requests: %d', channelCreator.length());
  };

  this.borrowChannel = function (next) {
    if (!regularChannelPool) return next(new Error(format('Vhost: %s must be initialised before you can borrow a channel', self.name)));
    regularChannelPool.borrow(next);
  };

  this.returnChannel = function (channel) {
    if (!regularChannelPool) return;
    regularChannelPool.release(channel);
  };

  this.destroyChannel = function (channel) {
    if (!regularChannelPool) return;
    regularChannelPool.destroy(channel);
  };

  this.borrowConfirmChannel = function (next) {
    if (!confirmChannelPool) return next(new Error(format('Vhost: %s must be initialised before you can borrow a confirm channel', self.name)));
    confirmChannelPool.borrow(next);
  };

  this.returnConfirmChannel = function (channel) {
    if (!confirmChannelPool) return;
    confirmChannelPool.release(channel);
  };

  this.destroyConfirmChannel = function (channel) {
    if (!confirmChannelPool) return;
    confirmChannelPool.destroy(channel);
  };

  this.isPaused = function () {
    return paused;
  };

  this.getConnectionDetails = function () {
    return { vhost: self.name, connectionUrl: connectionConfig.loggableUrl };
  };

  function createChannelPool(options) {
    const mode = getChannelMode(options.confirm);
    // eslint-disable-next-line prefer-const
    let pool, poolQueue;
    let busy = false;

    const factory = {
      create() {
        return new Promise((resolve, reject) => {
          debug('Creating pooled %s channel for vhost: %s', mode, config.name);
          createChannelWhenInitialised(options.confirm, (err, channel) => {
            if (err) return deferRejection(reject, err);
            if (!channel) return deferRejection(reject, new Error('Vhost is shutting down'));
            const destroyChannel = _.once(() => {
              debug('Destroying %s channel: %s for vhost: %s due to error or close event', mode, channel._rascal_id, config.name);
              channel._rascal_closed = true;
              if (pool.isBorrowedResource(channel)) {
                pool.destroy(channel).catch((err) => {
                  debug('Error destroying %s channel: %s for vhost: %s. %s', mode, channel._rascal_id, config.name, err.message);
                });
              }
            });
            channel.on('error', destroyChannel);
            channel.on('close', destroyChannel);
            resolve(channel);
          });
        });
      },
      destroy(channel) {
        return new Promise((resolve, reject) => {
          debug('Destroying %s channel: %s for vhost: %s', mode, channel._rascal_id, config.name);
          if (channel._rascal_closed) return resolve();
          channel.removeAllListeners();
          channel.on('error', reject);
          const closeChannelCb = (err) => {
            if (err) return reject(err);
            resolve();
          };
          // When a connection drops it may take a while for the heartbeat protocol or TCP keep alives to notice
          // Consequently a publication using confirm channels may timeout and attempt to close the channel
          // before Rascal notices that the connection died. In this circumstance the channel close command
          // will never receive a response from the broker, and the callback will never yield.
          const once = _.once(closeChannelCb);
          setTimeoutUnref(() => {
            once(new Error(format('Timeout after %dms closing %s channel: %s for vhost: %s', options.pool.destroyTimeoutMillis, mode, channel._rascal_id, config.name)));
          }, 1000);
          channel.close(once);
        });
      },
      validate(channel) {
        return new Promise((resolve) => {
          resolve(!channel._rascal_closed && connection && connection.connection === channel.connection);
        });
      },
    };

    function deferRejection(reject, err) {
      // generic-pool does not handle rejection well - it results in a tight loop which will
      // eat CPU and consume memory. Using setTimeout to spread the loop out a bit
      // https://github.com/coopernurse/node-pool/issues/197#issuecomment-477862861
      setTimeoutUnref(() => {
        reject(err);
      }, options.pool.rejectionDelayMillis);
    }

    function stats() {
      return {
        vhost: self.name,
        mode,
        queue: poolQueue.length(),
        size: pool.size,
        available: pool.available,
        borrowed: pool.borrowed,
        min: pool.min,
        max: pool.max,
      };
    }

    function borrow(next) {
      debug('Requested %s channel. %o', mode, stats());
      if (poolQueue.length() >= options.pool.max) {
        busy = true;
        self.emit('busy', stats());
      }
      poolQueue.push(null, (err, channel) => {
        if (err) return next(err);
        debug('Borrowed %s channel: %s. %o', mode, channel._rascal_id, stats());
        next(null, channel);
      });
    }

    function release(channel) {
      debug('Releasing %s channel: %s. %o', mode, channel._rascal_id, stats());
      pool
        .release(channel)
        .catch((err) => {
          debug('Error releasing %s channel: %s. %s', mode, channel._rascal_id, err.message);
        })
        .then(() => {
          if (poolQueue.length() > 0 || !busy) return;
          busy = false;
          self.emit('ready', stats());
        });
    }

    function destroy(channel) {
      debug('Destroying %s channel: %s. %o', mode, channel._rascal_id, stats());
      pool
        .destroy(channel)
        .catch((err) => {
          debug('Error destroying %s channel: %s. %s', mode, channel._rascal_id, err.message);
        })
        .then(() => {
          if (poolQueue.length() > 0 || !busy) return;
          busy = false;
          self.emit('ready', stats());
        });
    }

    function drain(next) {
      debug('Draining %s channel pool. %o', mode, stats());
      pool
        .drain()
        .then(() => {
          return pool.clear().then(() => {
            debug('Drained %s channel pool. %o', mode, stats());
            setImmediate(next);
          });
        })
        .catch((err) => {
          debug('Error draining %s channel pool. %s', mode, err.message);
          setImmediate(next);
        });
    }

    debug('Creating %s channel pool %o', mode, options.pool);
    pool = genericPool.createPool(factory, options.pool);
    pool.on('factoryCreateError', (err) => {
      debug('Create error emitted by %s channel pool: %s', mode, err.message);
    });
    pool.on('factoryDestroyError', (err) => {
      debug('Destroy error emitted by %s channel pool: %s', mode, err.message);
    });

    poolQueue = async.queue((__, next) => {
      pool
        .acquire()
        .then((channel) => {
          setImmediate(() => {
            next(null, channel);
          });
        })
        .catch(next);
    }, 1);

    return {
      stats,
      borrow,
      release,
      destroy,
      drain,
      pause: poolQueue.pause.bind(poolQueue),
      resume: poolQueue.resume.bind(poolQueue),
    };
  }

  function createChannelWhenInitialised(confirm, next) {
    if (connection) return createChannel(confirm, next);
    debug('Vhost: %s is not initialised. Deferring channel creation', self.name);
    setTimeoutUnref(() => {
      self.removeListener('vhost_initialised', onVhostInitialised);
      next(new Error('Timedout acquiring channel'), 5000);
    });
    function onVhostInitialised() {
      debug('Vhost: %s was initialised. Resuming channel creation', self.name);
      createChannel(confirm, next);
    }
    self.once('vhost_initialised', onVhostInitialised);
  }

  function createChannel(confirm, next) {
    if (shuttingDown) {
      debug('Ignoring create channel request. Vhost: %s is shutting down.', self.name);
      return next();
    }
    if (!connection) return next(new Error(format('Vhost: %s must be initialised before you can create a channel', self.name)));

    // Same problem as https://github.com/guidesmiths/rascal/issues/17
    const once = _.once(next);
    let invocations = 0;
    const channelId = uuid();

    connection.once('close', closeHandler);
    connection.once('error', errorHandler);
    confirm ? connection.createConfirmChannel(callback) : connection.createChannel(callback);

    function closeHandler() {
      once(new Error('Connection closed'));
    }

    function errorHandler(err) {
      once(err);
    }

    function callback(err, channel) {
      invocations++;
      connection && connection.removeListener('close', closeHandler);
      connection && connection.removeListener('error', errorHandler);
      if (err) {
        debug('Error creating channel: %s from %s: %s', channelId, connectionConfig.loggableUrl, err.message);
        return once(err);
      }

      channel._rascal_id = channelId;
      channel.connection._rascal_id = connection._rascal_id;
      channel.connection.setMaxListeners(0);
      debug('Created %s channel: %s from connection: %s', getChannelMode(confirm), channel._rascal_id, connection._rascal_id);

      // See https://github.com/squaremo/amqp.node/issues/388
      if (invocations > 1) {
        debug('Closing superfluous channel: %s previously reported as errored', channel._rascal_id);
        return channel.close();
      }

      once(null, channel);
    }
  }

  function getChannelMode(confirm) {
    return confirm ? 'confirm' : 'regular';
  }

  function pauseChannelAllocation() {
    channelCreator.pause();
    regularChannelPool && regularChannelPool.pause();
    confirmChannelPool && confirmChannelPool.pause();
    paused = true;
    self.emit('paused', { vhost: self.name });
  }

  function resumeChannelAllocation() {
    channelCreator.resume();
    regularChannelPool && regularChannelPool.resume();
    confirmChannelPool && confirmChannelPool.resume();
    paused = false;
    self.emit('resumed', { vhost: self.name });
  }

  function forwardRabbitMQConnectionEvents() {
    connection.on('blocked', (reason) => {
      self.emit('blocked', reason, self.getConnectionDetails());
    });
    connection.on('unblocked', () => {
      self.emit('unblocked', self.getConnectionDetails());
    });
  }

  function ensureChannelPools() {
    regularChannelPool =
      regularChannelPool ||
      createChannelPool({
        confirm: false,
        pool: config.publicationChannelPools.regularPool,
      });
    confirmChannelPool =
      confirmChannelPool ||
      createChannelPool({
        confirm: true,
        pool: config.publicationChannelPools.confirmPool,
      });
  }

  function drainChannelPools(next) {
    async.series(
      [
        function (cb) {
          regularChannelPool ? regularChannelPool.drain(cb) : cb();
        },
        function (cb) {
          confirmChannelPool ? confirmChannelPool.drain(cb) : cb();
        },
      ],
      next
    );
  }

  function attachErrorHandlers(config) {
    connection.removeAllListeners('error');
    const errorHandler = _.once(handleConnectionError.bind(null, connection, config));
    connection.on('error', errorHandler);
    connection.on('close', errorHandler);
  }

  function handleConnectionError(borked, config, err) {
    debug('Handling connection error: %s initially from connection: %s, %s', err.message, borked._rascal_id, connectionConfig.loggableUrl);
    pauseChannelAllocation();
    connection = undefined;
    self.emit('disconnect');
    self.emit('error', err, self.getConnectionDetails());
    connectionConfig.retry &&
      self.init((err) => {
        if (!err) return;
        const delay = timer.next();
        debug('Will attempt reconnection in in %dms', delay);
        reconnectTimeout = setTimeoutUnref(handleConnectionError.bind(null, borked, config, err), delay);
      });
  }
}
