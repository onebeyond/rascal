const debug = require('debug')('rascal:tasks:applyBindings');
const format = require('util').format;
const _ = require('lodash');
const async = require('async');

module.exports = _.curry((config, ctx, next) => {
  const bind = {
    queue: bindQueue,
    exchange: bindExchange,
  };

  async.eachOfLimit(
    _.values(config.bindings),
    config.concurrency,
    (binding, index, cb) => {
      const channel = ctx.channels[index % config.concurrency];
      bind[binding.destinationType](config, channel, binding, cb);
    },
    (err) => {
      next(err, config, ctx);
    },
  );
});

function bindQueue(config, channel, binding, next) {
  const destination = config.queues[binding.destination];
  if (!destination) return next(new Error(format('Unknown destination: %s', binding.destination)));

  const source = config.exchanges[binding.source];
  if (!source) return next(new Error(format('Unknown source: %s', binding.source)));

  debug('Binding queue: %s to exchange: %s with binding key: %s', destination.fullyQualifiedName, source.fullyQualifiedName, binding.bindingKey);
  channel.bindQueue(destination.fullyQualifiedName, source.fullyQualifiedName, binding.bindingKey, binding.options, next);
}

function bindExchange(config, channel, binding, next) {
  const destination = config.exchanges[binding.destination];
  if (!destination) return next(new Error(format('Unknown destination: %s', binding.destination)));

  const source = config.exchanges[binding.source];
  if (!source) return next(new Error(format('Unknown source: %s', binding.source)));

  debug('Binding exchange: %s to exchange: %s with binding key: %s', destination.fullyQualifiedName, source.fullyQualifiedName, binding.bindingKey);
  channel.bindExchange(destination.fullyQualifiedName, source.fullyQualifiedName, binding.bindingKey, binding.options, next);
}
