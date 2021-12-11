const debug = require('debug')('rascal:config:validate');
const format = require('util').format;
const _ = require('lodash');

module.exports = _.curry((config, next) => {
  try {
    validateVhosts(config.vhosts);
    validatePublications(config.publications);
    validateSubscriptions(config.subscriptions);
    validateEncryptionProfiles(config.encryption);
    validateShovels(config.shovels);
  } catch (err) {
    return next(err, config);
  }
  next(null, config);

  function validateVhosts(vhosts) {
    if (!vhosts || Object.keys(vhosts).length === 0) throw new Error('No vhosts specified');
    _.each(vhosts, validateVhost);
  }

  function validateVhost(vhost, vhostName) {
    validateAttributes('Vhost', vhost, vhostName, ['defaults', 'namespace', 'name', 'publicationChannelPools', 'connection', 'connections', 'connectionStrategy', 'exchanges', 'queues', 'bindings', 'check', 'assert']);
    validateConnectionStrategy(vhost.connectionStrategy, vhostName);
    validateConnectionAttributes(vhost.connection, vhostName, ['slashes', 'protocol', 'hostname', 'user', 'password', 'port', 'vhost', 'options', 'retry', 'auth', 'pathname', 'query', 'url', 'loggableUrl', 'management']);
    validateManagementConnectionAttributes(_.get(vhost), 'connection.management', vhostName, ['slashes', 'protocol', 'hostname', 'user', 'password', 'port', 'vhost', 'options', 'auth', 'pathname', 'query', 'url', 'loggableUrl']);
    validatePublicationChannelPools(vhost.publicationChannelPools, vhostName);
    validateExchanges(vhost, vhostName, vhost.exchanges);
    validateQueues(vhost, vhostName, vhost.queues);
    validateBindings(vhost, vhostName, vhost.bindings);
  }

  function validateAttributes(type, object, objectName, valid) {
    const invalid = _.chain(object).omit(valid).keys().value();
    if (invalid.length) throw new Error(format('%s: %s refers to an unsupported attribute: %s', type, objectName, invalid[0]));
  }

  function validateConnectionStrategy(strategy, vhostName) {
    if (![undefined, 'random', 'fixed'].includes(strategy)) throw new Error(format('Vhost: %s refers to an unknown connection strategy: %s', vhostName, strategy));
  }

  function validateConnectionAttributes(connection, vhostName, valid) {
    const invalid = _.chain(connection).omit(valid).keys().value();
    if (invalid.length) throw new Error(format('Vhost: %s connection refers to an unsupported attribute: %s', vhostName, invalid[0]));
  }

  function validateManagementConnectionAttributes(connection, vhostName, valid) {
    if (!connection) return;
    const invalid = _.chain(connection).omit(valid).keys().value();
    if (invalid.length) throw new Error(format('Vhost: %s management connection refers to an unsupported attribute: %s', vhostName, invalid[0]));
  }

  function validatePublicationChannelPools(publicationChannelPools, vhostName) {
    const invalid = _.chain(publicationChannelPools).omit(['regularPool', 'confirmPool']).keys().value();
    if (invalid.length) throw new Error(format('Publication channel pool in vhost: %s refers to an unsupported attribute: %s', vhostName, invalid[0]));
  }

  function validateVhostChildAttributes(vhostName, type, child, childName, valid) {
    const invalid = _.chain(child).omit(valid).keys().value();
    if (invalid.length) throw new Error(format('%s: %s in vhost: %s refers to an unsupported attribute: %s', type, childName, vhostName, invalid[0]));
  }

  function validateExchanges(vhost, vhostName, exchanges) {
    _.each(exchanges, validateExchange.bind(null, vhost, vhostName));
  }

  function validateExchange(vhost, vhostName, exchange, exchangeName) {
    validateVhostChildAttributes(vhostName, 'Exchange', exchange, exchangeName, ['fullyQualifiedName', 'name', 'assert', 'check', 'type', 'options']);
  }

  function validateQueues(vhost, vhostName, queues) {
    _.each(queues, validateQueue.bind(null, vhost, vhostName));
  }

  function validateQueue(vhost, vhostName, queue, queueName) {
    validateVhostChildAttributes(vhostName, 'Queue', queue, queueName, ['fullyQualifiedName', 'name', 'assert', 'check', 'type', 'purge', 'replyTo', 'options']);
  }

  function validateBindings(vhost, vhostName, bindings) {
    _.each(bindings, validateBinding.bind(null, vhost, vhostName));
  }

  function validateBinding(vhost, vhostName, binding, bindingName) {
    validateVhostChildAttributes(vhostName, 'Binding', binding, bindingName, ['fullyQualifiedName', 'name', 'source', 'destination', 'destinationType', 'bindingKey', 'bindingKeys', 'qualifyBindingKeys', 'options']);
    if (!binding.source) throw new Error(format('Binding: %s in vhost: %s is missing a source', bindingName, vhostName));
    if (!binding.destination) throw new Error(format('Binding: %s in vhost: %s is missing a destination', bindingName, vhostName));
    if (!binding.destinationType) throw new Error(format('Binding: %s in vhost: %s is missing a destination type', bindingName, vhostName));
    if (['queue', 'exchange'].indexOf(binding.destinationType) < 0) throw new Error(format('Binding: %s in vhost: %s has an invalid destination type: %s', bindingName, vhostName, binding.destinationType));

    if (!vhost.exchanges) throw new Error(format('Binding: %s in vhost: %s refers to an unknown exchange: %s', bindingName, vhostName, binding.source));
    if (!vhost.exchanges[binding.source]) throw new Error(format('Binding: %s in vhost: %s refers to an unknown exchange: %s', bindingName, vhostName, binding.source));

    if (binding.destinationType === 'queue') {
      if (!vhost.queues) throw new Error(format('Binding: %s in vhost: %s refers to an unknown queue: %s', bindingName, vhostName, binding.destination));
      if (!vhost.queues[binding.destination]) throw new Error(format('Binding: %s in vhost: %s refers to an unknown queue: %s', bindingName, vhostName, binding.destination));
    } else if (!vhost.exchanges[binding.destination]) throw new Error(format('Binding: %s in vhost: %s refers to an unknown exchange: %s', bindingName, vhostName, binding.destination));
  }

  function validatePublications(publications) {
    _.each(publications, validatePublication);
  }

  function validatePublication(publication, publicationName) {
    validateAttributes('Publication', publication, publicationName, ['name', 'vhost', 'exchange', 'queue', 'routingKey', 'confirm', 'options', 'destination', 'autoCreated', 'deprecated', 'encryption', 'timeout']);
    if (!publication.vhost) throw new Error(format('Publication: %s is missing a vhost', publicationName));
    if (!(Object.prototype.hasOwnProperty.call(publication, 'exchange') || publication.queue)) throw new Error(format('Publication: %s is missing an exchange or a queue', publicationName));
    if (Object.prototype.hasOwnProperty.call(publication, 'exchange') && publication.queue) throw new Error(format('Publication: %s has an exchange and a queue', publicationName));

    if (!config.vhosts) throw new Error(format('Publication: %s refers to an unknown vhost: %s', publicationName, publication.vhost));
    if (!config.vhosts[publication.vhost]) throw new Error(format('Publication: %s refers to an unknown vhost: %s', publicationName, publication.vhost));

    if (Object.prototype.hasOwnProperty.call(publication, 'exchange')) {
      if (!config.vhosts[publication.vhost].exchanges) throw new Error(format('Publication: %s refers to an unknown exchange: %s in vhost: %s', publicationName, publication.exchange, publication.vhost));
      if (!config.vhosts[publication.vhost].exchanges[publication.exchange]) throw new Error(format('Publication: %s refers to an unknown exchange: %s in vhost: %s', publicationName, publication.exchange, publication.vhost));
    } else {
      if (!config.vhosts[publication.vhost].queues) throw new Error(format('Publication: %s refers to an unknown queue: %s in vhost: %s', publicationName, publication.queue, publication.vhost));
      if (!config.vhosts[publication.vhost].queues[publication.queue]) throw new Error(format('Publication: %s refers to an unknown queue: %s in vhost: %s', publicationName, publication.queue, publication.vhost));
    }

    if (publication.encryption) validateEncryptionProfile(publication.encryption);
  }

  function validateSubscriptions(subscriptions) {
    _.each(subscriptions, validateSubscription);
  }

  function validateSubscription(subscription, subscriptionName) {
    validateAttributes('Subscription', subscription, subscriptionName, [
      'name',
      'vhost',
      'queue',
      'contentType',
      'options',
      'prefetch',
      'retry',
      'source',
      'recovery',
      'workflow',
      'handler',
      'workflows',
      'handlers',
      'redeliveries',
      'autoCreated',
      'deprecated',
      'closeTimeout',
      'encryption',
      'promisifyAckOrNack',
    ]);

    if (!subscription.vhost) throw new Error(format('Subscription: %s is missing a vhost', subscriptionName));
    if (!subscription.queue) throw new Error(format('Subscription: %s is missing a queue', subscriptionName));

    if (!config.vhosts) throw new Error(format('Subscription: %s refers to an unknown vhost: %s', subscriptionName, subscription.vhost));
    if (!config.vhosts[subscription.vhost]) throw new Error(format('Subscription: %s refers to an unknown vhost: %s', subscriptionName, subscription.vhost));

    if (!config.vhosts[subscription.vhost].queues) throw new Error(format('Subscription: %s refers to an unknown queue: %s in vhost: %s', subscriptionName, subscription.queue, subscription.vhost));
    if (!config.vhosts[subscription.vhost].queues[subscription.queue]) throw new Error(format('Subscription: %s refers to an unknown queue: %s in vhost: %s', subscriptionName, subscription.queue, subscription.vhost));

    if (_.get(config, 'config.redeliveries.counters')) throw new Error(format('Subscription: %s refers to an unknown counter: %s in vhost: %s', subscriptionName, subscription.redeliveries.counter, subscription.vhost));
    if (!config.redeliveries.counters[subscription.redeliveries.counter]) throw new Error(format('Subscription: %s refers to an unknown counter: %s in vhost: %s', subscriptionName, subscription.redeliveries.counter, subscription.vhost));

    if (subscription.encryption) validateEncryptionProfiles(subscription.encryption);
  }

  function validateEncryptionProfiles(encryption) {
    _.each(encryption, validateEncryptionProfile);
  }

  function validateEncryptionProfile(encryption, encryptionName) {
    validateAttributes('Encryption', encryption, encryptionName, ['name', 'key', 'algorithm', 'ivLength']);
    if (!encryption.key) throw new Error(format('Encryption profile: %s is missing a key', encryptionName));
    if (!encryption.algorithm) throw new Error(format('Encryption profile: %s is missing an algorithm', encryptionName));
    if (!encryption.ivLength) throw new Error(format('Encryption profile: %s is missing ivLength', encryptionName));
  }

  function validateShovels(shovels) {
    _.each(shovels, validateShovel);
  }

  function validateShovel(shovel, shovelName) {
    validateAttributes('Shovel', shovel, shovelName, ['name', 'subscription', 'publication']);
    if (!shovel.subscription) throw new Error(format('Shovel: %s is missing a subscription', shovelName));
    if (!shovel.publication) throw new Error(format('Shovel: %s is missing a publication', shovelName));

    if (!config.subscriptions[shovel.subscription]) throw new Error(format('Shovel: %s refers to an unknown subscription: %s', shovelName, shovel.subscription));
    if (!config.publications[shovel.publication]) throw new Error(format('Shovel: %s refers to an unknown publication: %s', shovelName, shovel.publication));
  }
});
