
var rootDirName = 'GraceNode';
var EventEmitter = require('events').EventEmitter;
var async = require('async');
var config = require('../modules/config');
var logger = require('../modules/log');
var log = logger.create('GraceNode');
var util = require('util');
var cluster = require('cluster');

var workerList = []; // master only

module.exports.GraceNode = GraceNode;

function GraceNode() {
	EventEmitter.call(this);
	// listeners
	setupListeners(this);
	// variables
	this._isMaster = false;
	this._configPath = '';
	this._configFiles = [];
	this._modules = [
		{ name: 'profiler', sourceName: 'profiler', config: null, path: null },
		{ name: 'lib', sourceName: 'lib', config: null, path: null }
	];
	this._root = __dirname.substring(0, __dirname.lastIndexOf(rootDirName));
	// detect current working directory directory
	var prevCwd = process.cwd();
	// change current working directory to the root of the application
	process.chdir(this._root);
	log.verbose('cwd changed: ' + prevCwd + ' > ' + this._root);
}

util.inherits(GraceNode, EventEmitter);

GraceNode.prototype.getRootPath = function () {
	return this._root;
};

GraceNode.prototype.isMaster = function () {
	return this._isMaster;
};

GraceNode.prototype.setConfigPath = function (configPath) {
	this._configPath = this._root + configPath;
	log.verbose('configuration path:', this._configPath);
};

GraceNode.prototype.setConfigFiles = function (fileList) {
	this._configFiles = fileList;
	log.verbose('configuration file list:', fileList);
};

GraceNode.prototype.exit = function (error) {
	process.exit(error || 0);
};

GraceNode.prototype.use = function (modName, params) {
	if (!params) {
		params = {};
	}
	this._modules.push({
		name: modName,
		sourceName: modName,
		config: params.configName || null,
		path: params.path || null
	});
};

GraceNode.prototype.setup = function (cb) {
	if (!this._configPath) {
		return this.exit(new Error('path to configuration files not set'));
	}
	if (!this._configFiles.length) {
		return this.exit(new Error('configuration files not set'));
	}
	var that = this;
	var starter = function (callback) {
		log.verbose('GraceNode is starting...');
		callback(null, that, cb);
	};
	var setupList = [
		starter, 
		setupConfig, 
		setupLog, 
		setupProfiler,
		setupProcess, 
		setupModules
	];
	async.waterfall(setupList, function (error) {
		if (error) {
			log.fatal(error);
			log.fatal('GraceNode failed to set up');
			return that.exit(error);
		}

		log.verbose('GraceNode set up complete');

		that.emit('setup.complete');
		
		cb();

		that._profiler.stop();
	});
};

function setupConfig(that, lastCallback, cb) {
	config.setPath(that._configPath);
	config.load(that._configFiles, function (error) {
		if (error) {
			return cb(error);
		}
		that.config = config;

		log.verbose('config is ready');

		that.emit('setup.config');

		cb(null, that, lastCallback);
	});
}

function setupLog(that, lastCallback, cb) {
	logger.readConfig(config.getOne('modules.log'));
	that.log = logger;

	log.verbose('log is ready');

	that.emit('setup.log');

	cb(null, that, lastCallback);
}

function setupProfiler(that, lastCallback, cb) {
	var profiler = require('../modules/profiler');

	// GraceNode profiler
	that._profiler = profiler.create(rootDirName);
	that._profiler.start();	

	// profiler for others
	that.profiler = profiler;

	log.verbose('profiler is ready');

	that.emit('setup._profiler');

	cb(null, that, lastCallback);	
}

function setupProcess(that, lastCallback, cb) {

	log.verbose('setting up process...');
	
	var CPUNum = require('os').cpus().length;
	var maxClusterNum = that.config.getOne('cluster.max') || 0;
	var max = Math.min(maxClusterNum, CPUNum);

	log.verbose('spawn process number: ' + max);
	
	if (cluster.isMaster && max) {
		
		// master process	

		that.log.setPrefix('MASTER');	
		log.info('in cluster mode [master]: number of CPU > ' + CPUNum + ' >> number of workers to be spawned: ' + max);
		log.info('(pid: ' + process.pid + ')');

		for (var i = 0; i < max; i++) {
			var worker = cluster.fork();
			workerList.push(worker);
			log.info('worker spawned: (pid: ' + worker.process.pid + ')');
		}

		that._isMaster = true;

		// set up termination listener
		cluster.on('exit', function (worker, code, sig) {
			workerList.splice(workerList.indexOf(worker), 1);
			log.error('worker has died: (pid: ' + worker.process.pid + ') [signal: ' + sig + '] ' + code);
		});

		that.on('shutdown', function (signal) {
			log.info('shutdown all workers');
			for (var i = 0, len = workerList.length; i < len; i++) {
				process.kill(workerList[i].process.pid, signal);
				log.info('worker has been killed: (pid: ' + workerList[i].process.pid + ')');
			}
		});
	
		// we stop here
		lastCallback();
	
	} else if (max) {
		
		// worker process

		that.log.setPrefix('WORKER (pid: '  + process.pid + ')');
		log.info('in cluster mode [worker] (pid: ' + process.pid + ')');
	
		cb(null, that);

	} else {
	
		// none-cluster mode
		log.info('in singleton mode: (pid: ' + process.pid + ')');		

		cb(null, that);

	}
	
}

function setupModules(that, cb) {
	log.verbose('start loading built-in modules');
	try {
		async.eachSeries(that._modules, function (mod, nextCallback) {
			var name = mod.name;
			var source = mod.sourceName;
			var dir = that.getRootPath() + rootDirName + '/' + (mod.path || 'modules/');
			var path = dir + name;
			var configName = 'modules.' + (mod.config || name);
			
			var module = null;
			
			that._profiler.mark('module [' + name + '] start loading');

			log.verbose('look for module [' + name + '] in ' + path);		
	
			try {
				// try GraceNode first
				module = require(path);
			} catch (exception) {
				// now try application
				path = that.getRootPath() + (mod.path || 'modules/');

				log.verbose('module [' + name + ']: ' + exception);
				log.verbose('> look for module [' + name + '] in ' + path);

				try {
					module = require(path);
				} catch (exception2) {
					log.error('failed to load module [' + name + ']: ' + path);
					return cb(exception2);	
				}
			}
		
			that[name] = module;			

			log.verbose('module [' + name + '] loading: ', path);

			if (typeof module.readConfig === 'function') {
				log.verbose('module [' + name + '] reading configurations: ' + configName);
				var status = module.readConfig(config.getOne(configName));
				if (status instanceof Error) {
					return cb(status);
				}
			}
		
			if (typeof module.setup === 'function') {
				module.setup(function (error) {
					if (error) {
						return cb(error);
					}
					that._profiler.mark('module [' + name + '] loaded');
					log.verbose('module [' + name + '] loaded');
					that.emit('setup.' + name);
					nextCallback();
				});
			} else {
				that._profiler.mark('module [' + name + '] loaded');
				log.verbose('module [' + name + '] loaded');
				that.emit('setup.' + name);
				nextCallback();
			}
		}, cb);
	} catch (e) {
		cb(e);
	}
}

function setupListeners(that) {
	
	process.on('uncaughtException', function (error) {
		log.fatal('GraceNode detected an uncaught exception');
		log.fatal(error);
		that.emit('uncaughtException');
	});

	process.on('exit', function (error) {
		that.emit('exit', error);
		if (error) {
			return log.fatal('exit GraceNode with an error:', error);
		}
		log.info('exit GraceNode');
	});

	process.on('SIGINT', function () {
		log.verbose('shutdown GraceNode');
		that.emit('shutdown');
		that.exit();
	});

	process.on('SIGQUIT', function () {
		log.verbose('quit GraceNode');
		that.emit('shutdown');
		that.exit();
	});

	process.on('SIGTERM', function () {
		log.verbose('terminate GraceNode');
		that.emit('shutdown');
		that.exit();
	});
}
