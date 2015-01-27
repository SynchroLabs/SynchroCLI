#!/usr/bin/env node

var wait = require('wait.for');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro init");
command.parse(process.argv);

wait.launchFiber(function()
{
	var config = util.getConfig();
	if (config)
	{
		console.log("Synchro has already been initialized in this directory, exiting");
		process.exit(1);
	}

	var defaultConfig = { "SYNCHRO_APPS": [] };

	util.putConfig(defaultConfig);

	console.log("Synchro is now initialized in this directory");
});
