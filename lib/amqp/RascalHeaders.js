const _ = require('lodash');

function sanitise(headers, queue) {
  if (!isTable(headers.rascal)) headers.rascal = {};
  removeUnless(isTable, headers, ['rascal', 'error']);
  removeUnless(isTable, headers, ['rascal', 'recovery']);
  removeUnless(isTable, headers, ['rascal', 'recovery', queue]);
  removeUnless(isCount, headers, ['rascal', 'recovery', queue, 'republished']);
  removeUnless(isCount, headers, ['rascal', 'recovery', queue, 'forwarded']);
  removeUnless(_.isString, headers, ['rascal', 'originalRoutingKey']);
  removeUnless(_.isString, headers, ['rascal', 'originalExchange']);
}

function removeUnless(isWellFormed, headers, path) {
  if (!_.has(headers, path)) return;
  if (!isWellFormed(_.get(headers, path))) _.unset(headers, path);
}

function isTable(value) {
  return _.isPlainObject(value) && !_.has(value, '!');
}

function isCount(value) {
  return _.isSafeInteger(value) && value >= 0;
}

module.exports = {
  sanitise,
};
