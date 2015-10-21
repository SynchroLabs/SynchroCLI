#!/usr/bin/env node

var wait = require('wait.for');
var read = require("read");
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro delete");
command.usage('[options] <appContainer>')
command.description('Delete the application container from the module store and remove it from the current configuration');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <appContainer> is not provided, you will be prompted for it.');
    console.log('');
    console.log('    The module store container will be deleted whether or not the app was installed in the current configuation.');
    console.log('');
});
command.parse(process.argv);

wait.launchFiber(function()
{
	var config = util.getConfigOrExit(command.config);
	var moduleStore = util.getModulesStore(config);

	var appContainer;
	if (command.args.length > 0)
	{
	    appContainer = command.args[0];
	}
	if (!appContainer)
	{
		appContainer = wait.for(read, {prompt: "App container: "});
		var verifyAppContainer = wait.for(read, {prompt: "Warning: All files will be deleted!  To confirm, re-enter app container: "});
		if (verifyAppContainer != appContainer)
		{
			console.log("Synchro app container name verification failed");
			process.exit(1);			
		}			
	}

	if (!appContainer || (appContainer.length == 0))
	{
		console.log("Synchro app container name cannot be empty");
		process.exit(1);
	}

	// Iterate active apps, and if any of them reference this container, remove them
	//
	var apps = config.get("APPS") || {};
	var anyDeleted = false;
	var appKeys = Object.keys(apps);
	if (appKeys && (appKeys.length > 0))
	{
		appKeys.forEach(function(appKey)
		{
			if (apps[appKey] && (apps[appKey].container == appContainer))
			{
				delete apps[appKey];
				anyDeleted = true;
				console.log("Synchro application in container '%s' removed from the active configuration at path '%s'", appContainer, appKey);
			}
		});
	}

	if (anyDeleted)
	{
		config.set("APPS", apps);
		config.save();
	}
	else
	{
		console.log("Synchro application in container '%s' not currently installed in the active configuration", appContainer);
	}

	try
	{
		moduleStore.deleteAppContainer(appContainer);
		console.log("Synchro container '%s' successfully deleted from module store", appContainer);
	}
	catch (err)
	{
		console.log("Error:", err);
	}
});