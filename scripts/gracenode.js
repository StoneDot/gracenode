#!/usr/bin/env node

// override console.log
var cl = console.log;
console.log = function () {};

var exec = require('child_process').exec;
var async = require('async');
var fs = require('fs');
var gn = require('../');
gn.setConfigPath('node_modules/gracenode/scripts/configs/');
gn.setConfigFiles(['gracenode.json']);

gn.defineOption('-V', 'Show version of gracenode', function () {
	var logger = gn.log.create('gracenode command version');
	var package = require('../package.json');
	logger.info('gracenode v' + package.version);
	gn.exit();
});

gn.defineOption('-l', 'Lint target (-l [file path(s)]) Javascript(s).', function (paths) {
	var jshint = require('jshint').JSHINT;
	var logger = gn.log.create('gracenode command lint');
	var lint = function (path, next) {
		fs.readFile(path, function (error, data) {
			if (error) {
				logger.error(path);
				return gn.exit(error);
			}
			if (path.lastIndexOf('.js') === -1) {
				// it is not a javascript
				return next();
			}
			var linted = jshint(data.toString());
			if (!linted) {
				var errors = jshint.data().errors;
				for (var i = 0, len = errors.length; i < len; i++) {
					var e = errors[i];
					if (e) {
						logger.error(path + ':', 'line,', e.line, e.reason);
					}
				}
				return gn.exit(new Error('[lint error: ' + path + ']'));
			}
			logger.info(path, '[passed]');
			next();
		});
	};
	var dirCheck = function (path, next) {
		fs.lstat(path, function (error, stat) {
			if (error) {
				logger.error(path);
				return gn.exit(error);
			}
			if (stat.isDirectory()) {
				// it is a directory
				gn.lib.walkDir(path, function (error, list) {
					if (error) {
						logger.error(path);
						return gn.exit(error);
					}
					async.each(list, function (item, done) {
						lint(item.file, done);
					}, next);
				});
				return;
			}
			// it is a file, lint now
			lint(path, next);
		});
	};
	
	if (typeof paths === 'string') {
		paths = [paths];
	}

	async.eachSeries(paths, function (path, next) {
		dirCheck(gn.getRootPath() + path, function () {
			next();
		});
	},
	function () {
		logger.info('[DONE]');
		gn.exit();
	});
});

gn.defineOption('--install', 'Installs the executable gracenode command to /usr/local/bin.', function () {
	var dist = '~/bin/gracenode';
	var dir = function (cb) {
		exec('mkdir ~/bin/', function () {
			cb();
		});
	};
	var link = function (cb) {
		exec('ln -s ' + gn._root + 'scripts/gracenode.js ' + dist, function (error) {
			cb(error);
		});
	};
	var chmod = function (cb) {
		exec('chmod +x ' + dist, function (error) {
			cb(error);
		});
	};
	async.series([
		dir,
		link,
		chmod
	],
	function (error) {
		gn.exit(error);
	});
});

// bring back console.log
console.log = cl;

gn.setup(function () {});