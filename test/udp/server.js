'use strict';

var gn = require('../../src/gracenode');

gn.config({
	http: {
		host: 'localhost',
		port: 7979
	},
	udp: {
		portRange: [7980, 7990]
	},
	log: {
		color: true,
		console: true,
		level: '>= verbose'
	}
});

gn.http.post('/auth', handleAuth);
gn.session.sessionDuration(1000);
gn.session.useUDPSession();
gn.udp.hook(1, testHook1);
gn.udp.command(1, 'testCommand1', testCommand1);

gn.start(function () {

	gn.udp.setup(function () {
		console.log('ready');
	});
});

function testHook1(state, next) {
	console.log('command hook', state.sessionId, state.seq);
	next();
}

function testCommand1(state) {
	console.log('command', state.payload);
	state.send({ message: 'Echo', payload: state.payload });
}

function handleAuth(req, res) {
	var data = 'session data';
	gn.session.setHTTPSession(req, res, data, function (error) {
		if (error) {
			return res.error(error);
		}
		res.json({
			sessionId: req.args.sessionId,
			host: '0.0.0.0',
			port: 7980,
			cipherData: req.args.cipher
		});
	});	
}