#!/usr/bin/env node

var co = require('co');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro delete");
command.usage('[options] <appContainer>')
command.description('Remove the app from the current configuration and delete the container from the module store');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <appContainer> is not provided, you will be prompted for it.');
    console.log('');
    console.log('    Any installed apps referencing the module store container will be removed from the current configuation.');
    console.log('    The module store container will then be deleted whether or not any app referenced it.');
    console.log('');
});
command.parse(process.argv);

co(function * ()
{
	var config = util.getConfigOrExit(command.config);
	var modulesStore = yield util.getModulesStoreAwaitable(config);
	var appsConfig = yield util.getAppsConfig(config, modulesStore);

	var appContainer;
	if (command.args.length > 0)
	{
	    appContainer = command.args[0];
	}
	if (!appContainer)
	{
        appContainer = yield util.read({prompt: "App container: "});
	}

	if (!appContainer || (appContainer.length == 0))
	{
		console.log("Synchro app container name cannot be empty");
		process.exit(1);
	}

	if (command.args.length == 0)
	{
		// We only verify if the app name was gathered interactively.  We assume that if you pass it on the command line, 
		// you know what you're doing.
		//
		var verifyAppContainer = yield util.read({prompt: "Warning: All files will be deleted!  To confirm, re-enter container name: "});
		if (verifyAppContainer != appContainer)
		{
			console.log("Synchro app container name verification failed");
			process.exit(1);
		}
	}

	var installedApps = appsConfig.installedAppsFromContainer(appContainer);
	if (installedApps.length > 0)
	{
		var apps = config.get("APPS") || {};
		for (var i = 0; i < installedApps.length; i++)
		{
			// We got these install apps from the config via installedAppsFromContainer above, so we can rely their existence below...
			// 
			var appPath = installedApps[i];
			delete appsConfig.APPS[appPath]
			console.log("Synchro application '%s' removed from the active configuration", appPath);
		}
		yield appsConfig.save();
	}
	else
	{
		console.log("No Synchro applications currently installed in the active configuration reference the container: %s", appContainer);
	}

	yield modulesStore.deleteAppContainerAwaitable(appContainer);
	console.log("Synchro container '%s' successfully deleted from module store", appContainer);

}).catch(function(err)
{ 
	console.log(err);
	process.exit(1);
});
