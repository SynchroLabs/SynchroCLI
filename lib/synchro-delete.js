#!/usr/bin/env node

var co = require('co');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro delete");
command.usage('[options] <containerName>')
command.description('Remove the app from the current configuration and delete the container from the module store');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <containerName> is not provided, you will be prompted for it.');
    console.log('');
    console.log('    Any installed apps referencing the module store container will be removed from the current configuation.');
    console.log('    The module store container will then be deleted whether or not any app referenced it.');
    console.log('');
});
command.parse(process.argv);

co(function * ()
{
	var config = util.getConfigOrExit(command.config);
	var moduleStore = util.getModulesStore(config);

	var containerName;
	if (command.args.length > 0)
	{
	    containerName = command.args[0];
	}
	if (!containerName)
	{
        containerName = yield util.read({prompt: "Container name: "});
	}

	if (!containerName || (containerName.length == 0))
	{
		console.log("Synchro container name cannot be empty");
		process.exit(1);
	}

	if (command.args.length == 0)
	{
		// We only verify if the app name was gathered interactively.  We assume that if you pass it on the command line, 
		// you know what you're doing.
		//
		var verifyContainerName = yield util.read({prompt: "Warning: All files will be deleted!  To confirm, re-enter container name: "});
		if (verifyContainerName != containerName)
		{
			console.log("Synchro container name cannot be empty");
			process.exit(1);
		}
	}

	var installedApps = util.installedAppsFromContainer(config, containerName);
	if (installedApps.length > 0)
	{
		var apps = config.get("APPS") || {};
		for (var i = 0; i < installedApps.length; i++)
		{
			// We got these install apps from the config via util.installedAppsFromContainer above, so we can rely their existence below...
			// 
			var appName = installedApps[i];
			delete apps[appName]
			console.log("Synchro application '%s' removed from the active configuration", appName);
		}
		config.set("APPS", apps);
		config.save();
	}
	else
	{
		console.log("No Synchro applications currently installed in the active configuration reference the container: %s", containerName);
	}

	yield moduleStore.deleteAppContainerAwaitable(containerName);
	console.log("Synchro container '%s' successfully deleted from module store", containerName);

}).catch(function(err){ console.log(err)});
