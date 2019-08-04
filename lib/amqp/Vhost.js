var debug = require('debug')('rascal:Vhost');
var format = require('util').format;
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var async = require('async');
var forwardEvents = require('forward-emitter');
var Pool = require('generic-pool').Pool;
var tasks = require('./tasks');
var uuid = require('uuid').v4;
var _ = require('lodash');
var backoff = require('../backoff');

module.exports = {
  create: function(config, next) {
    new Vhost(config).init(next);
  },
};

inherits(Vhost, EventEmitter);

function Vhost(config) {

  var self = this;
  var connection;
  var connectionConfig;
  var channelPool = createChannelPool({ confirm: false, size: config.publicationChannelPools.regularPoolSize });
  var confirmChannelPool = createChannelPool({ confirm: true, size: config.publicationChannelPools.confirmPoolSize });
  var channelCreator = async.queue(createChannel, 1);

  var init = async.compose(tasks.closeChannel, tasks.applyBindings, tasks.purgeQueues, tasks.checkQueues, tasks.assertQueues, tasks.checkExchanges, tasks.assertExchanges, tasks.createChannel, tasks.createConnection, tasks.checkVhost, tasks.assertVhost);
  var connect = async.compose(tasks.createConnection);
  var purge = async.compose(tasks.closeConnection, tasks.closeChannel, tasks.purgeQueues, tasks.createChannel, tasks.createConnection);
  var nuke = async.compose(tasks.closeConnection, tasks.closeChannel, tasks.deleteQueues, tasks.deleteExchanges, tasks.createChannel, tasks.createConnection);
  var timer = backoff({});

  pauseChannelAllocation();

  this.name = config.name;
  this.connectionIndex = 0;

  this.init = function(next) {
    debug('Initialising vhost: %s', config.name);
    pauseChannelAllocation();
    init(config, { connectionIndex: this.connectionIndex }, function(err, config, ctx) {
      if (err) return next(err);
      self.emit('connect');

      attachErrorHandlers(ctx.connection, config);

      forwardEvents(ctx.connection, self, function(eventName) {
        return eventName === 'blocked' || eventName === 'unblocked';
      });
      debug('vhost: %s was initialised with connection: %s', config.name, ctx.connection._rascal_id);
      connection = ctx.connection;
      self.connectionIndex = ctx.connectionIndex;
      connectionConfig = ctx.connectionConfig;
      timer = backoff(ctx.connectionConfig.retry);
      resumeChannelAllocation();
      return next(null, self);
    });
    return self;
  };

  this.nuke = function(next) {
    debug('Nuking vhost: %s', config.name);
    pauseChannelAllocation();
    nuke(config, { connectionIndex: this.connectionIndex }, function(err, config, ctx) {
      if (err) return next(err);
      connection = undefined;
      debug('Finished nuking vhost: %s', config.name);
      setImmediate(next);
    });
  };

  this.purge = function(next) {
    debug('Purging vhost: %s', config.name);
    purge(config, { purge: true, connectionIndex: this.connectionIndex }, function(err, config, ctx) {
      if (err) return next(err);
      debug('Finished purging vhost: %s', config.name);
      setImmediate(next);
    });
  };

  this.bounce = function(next) {
    async.series([
      self.disconnect,
      self.init,
    ], next);
  };

  this.connect = function(next) {
    debug('Connecting to vhost: %s', config.name);
    connect(config, { connectionIndex: this.connectionIndex }, function(err, config, ctx) {
      return next(err, ctx.connection);
    });
  };

  this.disconnect = function(next) {
    debug('Disconnecting from vhost: %s', config.name);
    pauseChannelAllocation();
    if (!connection) return next();
    connection.removeAllListeners();
    connection.on('error', function(err) {
      debug('Error disconnecting from %s. Original error was: %s', connectionConfig.loggableUrl, err.message);
    });
    connection.close(next);
  };

  this.getChannel = function(next) {
    channelCreator.push({ confirm: false }, next);
    debug('Requested channel. Outstanding channel requests: %d', channelCreator.length());
  };

  this.getConfirmChannel = function(next) {
    channelCreator.push({ confirm: true }, next);
    debug('Requested confirm channel. Outstanding channel requests: %d', channelCreator.length());
  };

  this.borrowChannel = channelPool.borrow;
  this.returnChannel = channelPool.return;
  this.borrowConfirmChannel = confirmChannelPool.borrow;
  this.returnConfirmChannel = confirmChannelPool.return;

  function createChannelPool(options) {
    var displayType = options.confirm ? ' confirm' : '';
    var pool = new Pool({
      max: options.size,
      create: function(next) {
        channelCreator.push(options, function(err, channel) {
          if (err) return next(err);
          var releaseChannel = _.once(function() {
            channel._rascal_closed = true;
            pool.release(channel);
          });
          channel.once('error', releaseChannel);
          channel.once('close', releaseChannel);
          next(null, channel);

        });
      },
      destroy: function(channel) {
        if (!channel._rascal_closed) channel.close();
      },
      refreshIdle: false,
      validate: function(channel) {
        return !channel._rascal_closed && connection && connection.connection === channel.connection;
      },
    });
    var poolQueue = async.queue(function(__, next) {
      pool.acquire(next);
    }, 1);

    function stats() {
      return format('Queue size: %d, pool size: %d, available: %d, taken: %d',
        poolQueue.length(), pool.getPoolSize(), pool.availableObjectsCount(), pool.inUseObjectsCount());
    }

    function borrow(next) {
      debug('Requested%s channel. %s', displayType, stats());
      poolQueue.push(null, function (err, channel) {
        if (err) return next(err);
        debug('Borrowed%s channel: %s. %s', displayType, channel._rascal_id, stats());
        next(null, channel);
      });
    }

    function release(channel) {
      debug('Returning%s channel: %s. %s', displayType, channel._rascal_id, stats());
      pool.release(channel);
    }

    return {
      borrow: borrow,
      return: release,
      pause: poolQueue.pause.bind(poolQueue),
      resume: poolQueue.resume.bind(poolQueue),
    };
  }

  function createChannel(options, next) {

    // Same problem as https://github.com/guidesmiths/rascal/issues/17
    var once = _.once(next);
    var invocations = 0;
    var channelId = uuid();

    options.confirm ? connection.createConfirmChannel(callback) : connection.createChannel(callback);

    function callback(err, channel) {
      invocations++;
      if (err) {
        debug('Error creating channel: %s from %s: %s', channelId, connectionConfig.loggableUrl, err.message);
        return once(err);
      }

      channel._rascal_id = channelId;
      channel.connection._rascal_id = connection._rascal_id;
      channel.connection.setMaxListeners(0);
      debug('Created channel %s from connection: %s', channel._rascal_id, connection._rascal_id);

      // See https://github.com/squaremo/amqp.node/issues/388
      if (invocations > 1) {
        debug('Closing superfluous channel: %s previously reported as errored', channel._rascal_id);
        return channel.close();
      }

      once(null, channel);
    }
  }

  function pauseChannelAllocation() {
    channelCreator.pause();
    channelPool.pause();
    confirmChannelPool.pause();
  }

  function resumeChannelAllocation() {
    channelCreator.resume();
    channelPool.resume();
    confirmChannelPool.resume();
  }

  function attachErrorHandlers(connection, config) {
    connection.removeAllListeners('error');
    var errorHandler = _.once(handleConnectionError.bind(null, connection, config));
    connection.once('error', errorHandler);
    connection.once('close', errorHandler);
  }

  function handleConnectionError(borked, config, err) {
    debug('Handling connection error: %s initially from connection: %s, vhost:%s', err.message, borked._rascal_id, connectionConfig.loggableUrl);
    self.emit('disconnect');
    pauseChannelAllocation();
    connection = undefined;
    self.emit('error', err);
    connectionConfig.retry && self.init(function(err) {
      if (!err) return;
      var delay = timer.next();
      debug('Will attempt reconnection in in %dms', delay);
      return setTimeout(handleConnectionError.bind(null, borked, config, err), delay).unref();
    });
  }
}
