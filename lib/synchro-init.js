#!/usr/bin/env node

var co = require('co');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro init");
command.description('Download, install, and configure a Synchro server in the current working directory.');
command.option('-p, --port <value>', 'The port on which the Synchro server will listen', parseInt);
command.option('-d, --debug-base-port <value>', 'The starting port for the debugging engine', parseInt);
command.option('-n, --no-studio', 'The Synchro Studio will not be enabled');
command.option('-s, --download-server <value>', 'The server from which to get Synchro packages');
command.option('-v, --server-version <value>', 'The version of Sychro Server to install, defaults to most current');
command.parse(process.argv);

if (command.debugBasePort && command.debugBasePort <= 1024)
{
	console.log("Error, debug base port must be greater than 1024, was:", command.debugBasePort);
	process.exit(1);
}

co(function * ()
{
	if (util.isSynchroInstalled())
	{
		console.log("Synchro has already been initialized in this directory, use 'synchro update' to update the Synchro instance here.");
		process.exit(1);
	}

	var pkgNodeVersion = yield util.downloadAndInstallServer(command);

	util.loadSynchro();

	var config = util.getConfigOrExit(); // There is no config file directive on a new install

	yield util.installAppRootDependencies(config);

	yield util.validatePackageNodeVersion(pkgNodeVersion);

	// Process command params (updating config)
	//
	if (command.port)
	{
		config.set("PORT", command.port);
	}
	if (command.debugBasePort)
	{
		config.set("DEBUG_BASE_PORT", command.debugBasePort);
	}
	if (!command.studio)
	{
		config.set("NOSTUDIO", true);
	}
	config.save();

	console.log("Synchro is now initialized in this directory");

}).catch(function(err){ console.log(err) });
