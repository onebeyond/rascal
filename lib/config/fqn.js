module.exports = {
  qualify: qualify,
  prefix: prefix,
  suffix: suffix,
};

function qualify(name, namespace, unique) {
  name = prefix(namespace, name);
  name = suffix(unique ? unique : undefined, name);
  return name;
}

function prefix(prefix, name, separator) {
  return prefix ? prefix + (separator || ':') + name : name;
}

function suffix(suffix, name, separator) {
  return suffix ? name + (separator || ':') + suffix : name;
}
