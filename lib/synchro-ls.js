#!/usr/bin/env node

var wait = require('wait.for');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro ls");
command.parse(process.argv);

wait.launchFiber(function()
{
	var config = util.getConfigOrExit();

	if (config["SYNCHRO_APPS"] && config["SYNCHRO_APPS"].length > 0)
	{
		for (var i = 0; i < config["SYNCHRO_APPS"].length; i++) 
		{
			// App:
			//
			// { "uriPath": "foo", "container": "foo" }
			//
			var app = config["SYNCHRO_APPS"][i];
			console.log("Found app: %s", app.container);
		}		
	}
	else
	{
		console.log("No Synchro apps installed in this directory");
	}
});
