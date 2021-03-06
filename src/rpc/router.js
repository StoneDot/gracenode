'use strict';

const async = require('../../lib/async');
const gn = require('../gracenode');
const hooks = require('./hooks');
const commands = {};
var logger;

module.exports.setup = function __rpcRouterSetup() {
    logger = gn.log.create('RPC.router');
};

module.exports.getCommandList = function () {
    const list = [];
    for (const id in commands) {
        list.push({ id: id, name: commands[id].name });
    }
    return list;
};

module.exports.define = function __rpcRouterDefine(cmdId, cmdName, handler) {
    if (commands[cmdId]) {
        if (cmdName !== commands[cmdId].name) {
            logger.error(
                'command name does not match for command ' + cmdId + ':',
                cmdName,
                commands[cmdId].name,
                '"' + cmdName + '" is ignored'
            );
        }
        commands[cmdId].handlers.push(handler);
        return;
    }
    commands[cmdId] = {
        id: cmdId,
        name: cmdName,
        handlers: [ handler ]
    };
};

module.exports.getIdsByNames = function __rpcRouterGetIdsByNames(names) {
    if (!Array.isArray(names)) {
        names = [names];
    }
    for (var id in commands) {
        var index = names.indexOf(commands[id].name);
        if (index !== -1) {
            // replace command name with its command ID
            names[index] = id;
        }
    }
    return names;
};

module.exports.route = function __rpcRouterRoute(name, packet) {

    if (!packet) {
        return null;
    }

    if (commands[packet.command] === undefined) {
        logger.error(name, 'command handler not found for ', packet.command, packet);
        return null;    
    }
    
    var cmd = commands[packet.command];

    return {
        id: cmd.id,
        name: cmd.name,
        handlers: cmd.handlers,
        hooks: _execHooks
    };
};

function _execHooks(packet, state, cb) {
    var params = { state: state };
    var hookList = hooks.findByCmdId(packet.command);
    async.loopSeries(hookList, params, _onEachHook, cb);
}

function _onEachHook(hook, params, next) {
    hook(params.state, next);
}
