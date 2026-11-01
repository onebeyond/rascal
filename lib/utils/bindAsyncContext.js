const { AsyncResource } = require('async_hooks');

/*
 * Returns a function that invokes fn in the async context of whoever called bindAsyncContext,
 * irrespective of the async context it is eventually invoked from.
 *
 * Rascal hands callbacks to async queues and to amqplib. Queues invoke them from the context of
 * whichever caller triggered queue processing, and amqplib invokes them from its socket handler.
 * Without this, tooling built on AsyncLocalStorage (e.g. APM tracers) attributes the resulting
 * work to the wrong caller. See https://github.com/onebeyond/rascal/issues/246
 *
 * The AsyncResource is destroyed when garbage collected, which is Node's default behaviour.
 */
module.exports = function bindAsyncContext(fn, name = 'rascal') {
  const resource = new AsyncResource(name);
  return function (...args) {
    return resource.runInAsyncScope(fn, this, ...args);
  };
};
