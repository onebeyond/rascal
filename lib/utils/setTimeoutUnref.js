// See https://github.com/guidesmiths/rascal/issues/89
module.exports = function (fn, millis) {
  const t = setTimeout(fn, millis);
  return t.unref ? t.unref() : t;
};
