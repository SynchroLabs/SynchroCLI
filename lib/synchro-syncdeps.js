#!/usr/bin/env node

var wait = require('wait.for');
var read = require("read");
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro syncdeps");
command.usage('[options] <appname>');
command.description('Ensure that the dependencies of the specified Synchro app are installed on the local server');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <appname> is not provided on the command line, you will be prompted for it.');
    console.log('');
});
});command.parse(process.argv);

wait.launchFiber(function()
{
	var config = util.getConfigOrExit(command.config);
	var moduleStore = util.getModulesStore(config);

	var appName;
	if (command.args.length > 0)
	{
	    appName = command.args[0];
	}
	if (!appName)
	{
		appName = wait.for(read, {prompt: "App name: "});
	}

	if (!appName || (appName.length == 0))
	{
		console.log("Synchro app name cannot be empty");
		process.exit(1);
	}

	// Find the app in the module store...
	//
	var appModuleStore;
	var appContainers = moduleStore.getAppContainers() || [];
	if (appContainers.length > 0)
	{
		for (var i = 0; i < appContainers.length; i++) 
		{
			if (appContainers[i] == appName)
			{
				appModuleStore = moduleStore.getAppModuleStore(appName);
			}
		}
	}

	if (appModuleStore)
	{
		// Check to see if there are any dependencies in appDefinition
		//
		var appDefinition = appModuleStore.getAppDefinition();
		if (appDefinition["dependencies"] && (Object.keys(appDefintion["dependencies"]).length > 0))
		{
			// !!! Copy appDefinition to <container>/package.json
			//
			// config.get('APP_ROOT_PATH');
			//
			// !!! Do npm install in <container>
			//
		}
		else
		{
			console.log("Synchro app '%s' has no dependencies, no action taken", appName);			
		}
	}
	else
	{
		console.log("Synchro container '%s' not present in module store", appName);
	}
});
