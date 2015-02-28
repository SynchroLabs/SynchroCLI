#!/usr/bin/env node

var wait = require('wait.for');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro ls");
command.option('-c, --config <value>', 'Use the specified configuration file');
command.option('-d, --details', 'Display details from synchro.json for each app');
command.parse(process.argv);

wait.launchFiber(function()
{
	var config = util.getConfigOrExit(command.config);
	var moduleStore = util.getModulesStore(config);

	var apps = config.get("SYNCHRO_APPS") || [];
	if (apps.length > 0)
	{
		for (var i = 0; i < apps.length; i++) 
		{
			// App:
			//
			// { "uriPath": "foo", "container": "foo" }
			//
			var app = apps[i];
			console.log("Found app: %s", app.container);

			if (command.details)
			{
				var appModuleStore = moduleStore.getAppModuleStore(app.container);
				var appDefinition = appModuleStore.getAppDefinition();
				console.log("App definition from store:", appDefinition);				
			}
		}		
	}
	else
	{
		console.log("No Synchro apps installed in this directory");
	}
});
