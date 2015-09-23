#!/usr/bin/env node

var wait = require('wait.for');
var fs = require('fs');
var path = require('path');

var tarStream = require('tar-stream');
var zlib = require('zlib');
var isGzip = require('is-gzip');
var isTar = require('is-tar');
var tarFs = require('tar-fs');
var npm = require('npm');

var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro update");
command.usage('[options] <appName> <description>');
command.description('Update a Synchro server in the current working directory to the most current version.');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.option('-s, --download-server <value>', 'The server from which to get Synchro packages');
command.option('-t, --download-token <value>', 'The auth token to use in getting Synchro packages');
command.option('-v, --server-version <value>', 'The version of Sychro Server to install, defaults to most current');
command.parse(process.argv);

wait.launchFiber(function()
{
	if (!util.isSynchroInstalled())
	{
		console.log("Synchro has not yet been initialized in this directory, use 'synchro init' to create a new Synchro instance here.");
		process.exit(1);
	}

	var config = util.getConfigOrExit(command.config);

	util.downloadAndInstallServer(command);
	util.installAppDependencies(config);

	console.log("Synchro has been updated in this directory");    	
});
