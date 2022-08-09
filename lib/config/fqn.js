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

function prefix(text, name, separator) {
  return text ? text + (separator || ':') + name : name;
}

function suffix(text, name, separator) {
  return text ? name + (separator || ':') + text : name;
}
