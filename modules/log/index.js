var loggerSource = require('./logger');
var EventEmitter = require('events').EventEmitter;

var config = null;
var prefix = '';
var appPrefix = '';

module.exports = new EventEmitter();

loggerSource.events.on('output', function (address, name, level, data) {
	module.exports.emit('output', address, name, level, data);
});

module.exports.readConfig = function (configIn) {
	if (!configIn) {
		throw new Error('invalid configurations:\n' + JSON.stringify(configIn, null, 4));
	}
	
	config = configIn;
	
	return true;
};

module.exports.setup = function (cb) {
	loggerSource.setup(module.exports.gracenode, config);
	cb();
};

module.exports.setPrefix = function (p) {
	appPrefix = p;
};

module.exports._setInternalPrefix = function (p) {
	prefix = p;
};

module.exports.create = function (name) {
	return loggerSource.create(prefix + appPrefix, name, config);
};

module.exports.forceFlush = function (cb) {
	loggerSource.forceFlush(cb);
};
