// See https://github.com/guidesmiths/rascal/issues/89
module.exports = function(fn, millis) {
  var t = setTimeout(fn, millis);
  return t.unref ? t.unref() : t;
};
