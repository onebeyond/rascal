var safeParse = require('safe-json-parse/callback');

module.exports = function negotiateContent(contentType, content, next) {
  if (contentType === 'text/plain') return next(null, content.toString());
  if (contentType === 'application/json') return safeParse(content.toString(), next);
  return next(null, content);
};
