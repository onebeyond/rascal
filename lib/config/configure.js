const debug = require('debug')('rascal:config:configure');
const format = require('util').format;
const url = require('url');
const _ = require('lodash');
const uuid = require('uuid').v4;
const baseline = require('./baseline');
const fqn = require('./fqn');
const XRegExp = require('xregexp');

module.exports = _.curry((rascalConfig, next) => {
  rascalConfig = _.defaultsDeep(rascalConfig, baseline);

  let err;
  const connectionIndexes = {};

  try {
    configureVhosts(rascalConfig.vhosts);
    configurePublications(rascalConfig.publications, rascalConfig.vhosts);
    configureSubscriptions(rascalConfig.subscriptions, rascalConfig.vhosts);
    configureShovels(rascalConfig.shovels);
    configureCounters(rascalConfig.redeliveries.counters);
  } catch (_err) {
    err = _err;
  }

  return err ? next(err) : next(null, rascalConfig);

  function configureVhosts(vhosts) {
    _.each(vhosts, (vhostConfig, name) => {
      configureVhost(name, vhostConfig);
      configureExchanges(vhostConfig);
      configureQueues(vhostConfig);
      configureBindings(vhostConfig);
      configureVhostPublications(vhostConfig);
      configureVhostSubscriptions(vhostConfig);
    });
  }

  function configureVhost(name, vhostConfig) {
    debug('Configuring vhost: %s', name);
    rascalConfig.vhosts[name] = _.defaultsDeep(
      vhostConfig,
      {
        name,
        namespace: rascalConfig.defaults.vhosts.namespace,
        connectionStrategy: rascalConfig.defaults.vhosts.connectionStrategy,
        publicationChannelPools: rascalConfig.defaults.vhosts.publicationChannelPools,
      },
      { defaults: rascalConfig.defaults.vhosts }
    );
    rascalConfig.vhosts[name].namespace = vhostConfig.namespace === true ? uuid() : vhostConfig.namespace;
    configureConnections(vhostConfig, name);
  }

  function configureConnections(vhostConfig, vhostName) {
    vhostConfig.connections = _.chain([])
      .concat(vhostConfig.connections, vhostConfig.connection)
      .compact()
      .uniq()
      .map((connection) => {
        return _.isString(connection) ? { url: connection } : connection;
      })
      .value();
    if (vhostConfig.connections.length === 0) vhostConfig.connections.push({});
    _.each(vhostConfig.connections, (connection, index) => {
      configureConnection(vhostConfig, vhostName, connection, index);
    });
    vhostConfig.connections = _.sortBy(vhostConfig.connections, 'index');
    delete vhostConfig.connection;
  }

  function configureConnection(vhostConfig, vhostName, connection, index) {
    _.defaultsDeep(connection, vhostConfig.defaults.connection);
    connection.vhost = connection.vhost !== undefined ? connection.vhost : vhostName;
    connection.auth = connection.auth || getAuth(connection.user, connection.password);
    connection.pathname = connection.vhost === '/' ? '' : connection.vhost;
    connection.query = connection.options;
    connection.url = connection.url || url.format(connection);
    connection.loggableUrl = connection.url.replace(/:[^:]*?@/, ':***@');
    connection.index = getConnectionIndex(vhostConfig.connectionStrategy, connection, index);
    configureManagementConnection(vhostConfig, vhostName, connection);
  }

  function configureManagementConnection(vhostConfig, vhostName, connection) {
    _.defaultsDeep(connection.management, { hostname: connection.hostname });
    connection.management.auth = connection.management.auth || getAuth(connection.management.user, connection.management.password) || connection.auth;
    connection.management.url = connection.management.url || url.format(connection.management);
    connection.management.loggableUrl = connection.management.url.replace(/:[^:]*?@/, ':***@');
  }

  function getAuth(user, password) {
    return user && password ? user + ':' + password : undefined;
  }

  function getConnectionIndex(strategy, connection, index) {
    if (strategy === 'fixed') return index;
    const host = url.parse(connection.url).host;
    if (_.has(connectionIndexes, host)) return connectionIndexes[host];
    connectionIndexes[host] = Math.random();
    return connectionIndexes[host];
  }

  function configureVhostPublications(vhostConfig) {
    _.each(vhostConfig.publications, (publicationConfig, name) => {
      publicationConfig.vhost = vhostConfig.name;
      configurePublication(publicationConfig, name);
    });
    delete vhostConfig.publications;
  }

  function configurePublications(publications, vhosts) {
    const defaultPublications = _.reduce(
      vhosts,
      (publications, vhost) => {
        _.each(vhost.exchanges, (exchange) => {
          const name = vhost.name === '/' ? format('/%s', exchange.name) : format('%s/%s', vhost.name, exchange.name);
          publications[name] = {
            exchange: exchange.name,
            vhost: vhost.name,
            autoCreated: true,
          };
        });
        _.each(vhost.queues, (queue) => {
          const name = vhost.name === '/' ? format('/%s', queue.name) : format('%s/%s', vhost.name, queue.name);
          publications[name] = {
            queue: queue.name,
            vhost: vhost.name,
            autoCreated: true,
          };
        });
        return publications;
      },
      {}
    );

    _.each(_.defaults({}, publications, defaultPublications), configurePublication);
  }

  function configurePublication(publicationConfig, name) {
    debug('Configuring publication: %s', name);
    if (rascalConfig.publications[name] && rascalConfig.publications[name].vhost !== publicationConfig.vhost) throw new Error(format('Duplicate publication: %s', name));
    rascalConfig.publications[name] = _.defaultsDeep(publicationConfig, { name }, rascalConfig.defaults.publications);
    if (!rascalConfig.vhosts[publicationConfig.vhost]) return;
    const destination = Object.prototype.hasOwnProperty.call(publicationConfig, 'exchange') ? rascalConfig.vhosts[publicationConfig.vhost].exchanges[publicationConfig.exchange] : rascalConfig.vhosts[publicationConfig.vhost].queues[publicationConfig.queue];
    rascalConfig.publications[name].destination = destination.fullyQualifiedName;

    if (publicationConfig.encryption && _.isString(publicationConfig.encryption)) {
      rascalConfig.publications[name].encryption = _.defaultsDeep({ name: publicationConfig.encryption }, rascalConfig.encryption[publicationConfig.encryption]);
    }
  }

  function configureVhostSubscriptions(vhostConfig) {
    _.each(vhostConfig.subscriptions, (subscriptionConfig, name) => {
      subscriptionConfig.vhost = vhostConfig.name;
      configureSubscription(subscriptionConfig, name);
    });
    delete vhostConfig.subscriptions;
  }

  function configureSubscriptions(subscriptions, vhosts) {
    const defaultSubscriptions = _.reduce(
      vhosts,
      (subscriptions, vhost) => {
        _.each(vhost.queues, (queue) => {
          const name = vhost.name === '/' ? format('/%s', queue.name) : format('%s/%s', vhost.name, queue.name);
          subscriptions[name] = {
            queue: queue.name,
            vhost: vhost.name,
            autoCreated: true,
          };
        });
        return subscriptions;
      },
      {}
    );
    _.each(_.defaults({}, subscriptions, defaultSubscriptions), configureSubscription);
  }

  function configureSubscription(subscriptionConfig, name) {
    debug('Configuring subscription: %s', name);
    if (rascalConfig.subscriptions[name] && rascalConfig.subscriptions[name].vhost !== subscriptionConfig.vhost) throw new Error(format('Duplicate subscription: %s', name));
    rascalConfig.subscriptions[name] = _.defaultsDeep(subscriptionConfig, { name }, rascalConfig.defaults.subscriptions);
    if (!rascalConfig.vhosts[subscriptionConfig.vhost]) return;
    subscriptionConfig.source = rascalConfig.vhosts[subscriptionConfig.vhost].queues[subscriptionConfig.queue].fullyQualifiedName;
    subscriptionConfig.encryption = subscriptionConfig.encryption || _.defaultsDeep({}, rascalConfig.encryption);
  }

  function configureShovels(shovels) {
    rascalConfig.shovels = ensureKeyedCollection(shovels);
    _.each(rascalConfig.shovels, configureShovel);
  }

  function configureShovel(shovelConfig, name) {
    debug('Configuring shovel: %s', name);
    const parsedConfig = parseShovelName(name);
    rascalConfig.shovels[name] = _.defaultsDeep(shovelConfig, { name }, parsedConfig, rascalConfig.defaults.shovels);
  }

  function parseShovelName(name) {
    const pattern = XRegExp('(?<subscription>[\\w:]+)\\s*->\\s*(?<publication>[\\w:]+)');
    const match = XRegExp.exec(name, pattern);
    return match
      ? {
          name,
          subscription: match.groups.subscription,
          publication: match.groups.publication,
        }
      : { name };
  }

  function configureCounters(counters) {
    rascalConfig.redeliveries.counters = ensureKeyedCollection(counters);
    _.each(rascalConfig.redeliveries.counters, configureCounter);
  }

  function configureCounter(counterConfig, name) {
    debug('Configuring counter: %s', name);
    const counterType = counterConfig.type || name;
    const counterDefaultConfigPath = 'defaults.redeliveries.counters.' + counterType;
    const counterDefaults = _.get(rascalConfig, counterDefaultConfigPath);
    rascalConfig.redeliveries.counters[name] = _.defaultsDeep(counterConfig, { name, type: name }, counterDefaults);
  }

  function configureExchanges(config) {
    const defaultExchange = { '': {} };
    config.exchanges = _.defaultsDeep(ensureKeyedCollection(config.exchanges), defaultExchange);
    _.each(config.exchanges, (exchangeConfig, name) => {
      debug('Configuring exchange: %s', name);
      config.exchanges[name] = _.defaultsDeep(exchangeConfig, { name, fullyQualifiedName: fqn.qualify(name, config.namespace) }, config.defaults.exchanges);
    });
  }

  function configureQueues(config) {
    config.queues = ensureKeyedCollection(config.queues);
    _.each(config.queues, (queueConfig, name) => {
      debug('Configuring queue: %s', name);
      queueConfig.replyTo = queueConfig.replyTo === true ? uuid() : queueConfig.replyTo;
      qualifyArguments(config.namespace, queueConfig.options && queueConfig.options.arguments);
      config.queues[name] = _.defaultsDeep(
        queueConfig,
        {
          name,
          fullyQualifiedName: fqn.qualify(name, config.namespace, queueConfig.replyTo),
        },
        config.defaults.queues
      );
    });
  }

  function configureBindings(config) {
    config.bindings = expandBindings(ensureKeyedCollection(config.bindings));

    _.each(config.bindings, (bindingConfig, name) => {
      debug('Configuring binding: %s', name);

      config.bindings[name] = _.defaultsDeep(bindingConfig, config.defaults.bindings);

      if (bindingConfig.qualifyBindingKeys) {
        config.bindings[name].bindingKey = fqn.qualify(bindingConfig.bindingKey, config.namespace);
      }
      if (bindingConfig.destinationType === 'queue') {
        const queue = config.queues[bindingConfig.destination];
        config.bindings[name].bindingKey = fqn.prefix(queue && queue.replyTo, bindingConfig.bindingKey, '.');
      }
    });
  }

  function parseBindingName(name) {
    const pattern = XRegExp('(?<source>[\\w:\\.\\-]+)\\s*(?:\\[\\s*(?<keys>.*)\\s*\\])?\\s*->\\s*(?<destination>[\\w:\\.\\-]+)');
    const match = XRegExp.exec(name, pattern);
    return match
      ? {
          name,
          source: match.groups.source,
          destination: match.groups.destination,
          bindingKeys: splitBindingKeys(match.groups.keys),
        }
      : { name };
  }

  function splitBindingKeys(keys) {
    return keys ? _.compact(keys.split(/[,\s]+/)) : undefined;
  }

  function expandBindings(definitions) {
    const result = {};
    _.each(definitions, (bindingConfig, name) => {
      const parsedConfig = parseBindingName(name);
      const bindingKeys = _.chain([]).concat(bindingConfig.bindingKeys, bindingConfig.bindingKey, parsedConfig.bindingKeys).compact().uniq().value();
      if (bindingKeys.length <= 1) {
        result[name] = _({ bindingKey: bindingKeys[0] }).defaults(bindingConfig, parsedConfig).omit('bindingKeys').value();
        return result[name];
      }
      _.each(bindingKeys, (bindingKey) => {
        result[format('%s:%s', name, bindingKey)] = _({ bindingKey }).defaults(bindingConfig, parsedConfig).omit('bindingKeys').value();
      });
    });
    return result;
  }

  function qualifyArguments(namespace, args) {
    if (!args) return;
    _.each(['x-dead-letter-exchange'], (name) => {
      args[name] = args[name] !== undefined ? fqn.qualify(args[name], namespace) : args[name];
    });
  }

  function ensureKeyedCollection(collection) {
    if (!_.isArray(collection)) return collection;
    return _.chain(collection)
      .map((item) => {
        return _.isString(item) ? { name: item } : _.defaults(item, { name: 'unnamed-' + uuid() });
      })
      .keyBy('name')
      .value();
  }
});
