#!/usr/bin/env node

var wait = require('wait.for');
var read = require("read");
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro delete");
command.usage('[options] <appName>')
command.description('Remove the app from the current configuration and delete the container from the module store');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <appName> is not provided, you will be prompted for it.');
    console.log('');
    console.log('    The module store container will be deleted whether or not the app was installed in the current configuation.');
    console.log('');
});
command.parse(process.argv);

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

	if (util.isAppInstalled(config, appName))
	{
		if (command.args.length == 0)
		{
			// We only verify if the app name was gathered interactively.  We assume that if you pass it on the command line, 
			// you know what you're doing.
			//
			var verifyAppName = wait.for(read, {prompt: "Warning: All files will be deleted!  To confirm, re-enter app name: "});
			if (verifyAppName != appName)
			{
				console.log("Synchro app name cannot be empty");
				process.exit(1);			
			}			
		}

		var apps = config.get("SYNCHRO_APPS") || [];
		for (var i = 0; i < apps.length; i++) 
		{
			// App:
			//
			// { "uriPath": "foo", "container": "foo" }
			//
			var app = apps[i];
			if ((app.container == appName) || (app.uriPath == appName))
			{
				apps.splice(i, 1);
				config.set("SYNCHRO_APPS", apps);
				config.save();
				console.log("Synchro application '%s' removed from the active configuration", appName);
				break;
			}
		}
	}
	else
	{
		console.log("Synchro application '%s' not currently installed in the active configuration", appName);
	}

	try
	{
		moduleStore.deleteAppContainer(appName);
		console.log("Synchro container '%s' successfully deleted from module store", appName);
	}
	catch (err)
	{
		console.log("Error:", err);
	}
});