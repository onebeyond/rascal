module.exports = {
  qualify,
  prefix,
  suffix,
};

function qualify(name, namespace, unique) {
  if (name === '') return name;
  name = prefix(namespace, name);
  name = suffix(unique || undefined, name);
  return name;
}

function prefix(prefix, name, separator) {
  return prefix ? prefix + (separator || ':') + name : name;
}

function suffix(suffix, name, separator) {
  return suffix ? name + (separator || ':') + suffix : name;
}
