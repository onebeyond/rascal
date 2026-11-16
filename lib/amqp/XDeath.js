const _ = require('lodash');

const EMPTY_X_DEATH = { count: 0, time: { value: 0 } };

function getCurrentXDeath(headers, queue) {
  const records = _.isArray(headers['x-death']) ? headers['x-death'] : [];
  const rejection = records.find((record) => isRejection(record, queue));
  return isComparable(rejection) ? rejection : EMPTY_X_DEATH;
}

function getPreviousXDeath(headers, queue) {
  const rejection = _.get(headers, ['rascal', 'recovery', queue, 'xDeath']);
  return isComparable(rejection) ? rejection : EMPTY_X_DEATH;
}

function isRejection(record, queue) {
  return _.get(record, 'queue') === queue && _.get(record, 'reason') === 'rejected';
}

function isComparable(record) {
  return _.isNumber(_.get(record, 'count')) && _.isNumber(_.get(record, ['time', 'value']));
}

module.exports = {
  EMPTY_X_DEATH,
  getCurrentXDeath,
  getPreviousXDeath,
};
