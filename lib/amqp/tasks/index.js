var fs = require('fs');
var path = require('path');

fs.readdirSync(__dirname).filter(byTask).forEach(function(fileName) {
    var moduleName = fileName.replace(/\.js$/, '');
    exports[moduleName] = require(path.join(__dirname, fileName));
});

function byTask(fileName) {
    if (fileName === 'index.js') return false;
    if (fileName.match(/\.js$/)) return true;
}
