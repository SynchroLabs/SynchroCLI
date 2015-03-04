#!/usr/bin/env node

var wait = require('wait.for');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro remove");
command.usage('[options] <appname>');
command.description('Remove an app from the current configuration without removing its container from the module store');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <appname> is not provided on the command line, you will be prompted for it.');
    console.log('');
});
command.parse(process.argv);

wait.launchFiber(function()
{
	var config = util.getConfigOrExit(command.config);

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

	if (!util.isAppInstalled(config, appName))
	{
		console.log("Synchro app named '%s' not currently installed in the active configuration", appName);
		process.exit(1);
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
});