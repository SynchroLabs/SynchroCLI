#!/usr/bin/env node

var co = require('co');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro add");
command.usage('[options] <containerName> <appName>')
command.description('Add an app whose container exists in the module store to the current configuration.');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <containerName> is provided on the command line and <appName> is not, the app name will default to the container name.');
    console.log('    If neither <containerName> nor <appName> are provided on the command line, you will be prompted for both.');
    console.log('');
});
command.parse(process.argv);

co(function * ()
{
	var config = util.getConfigOrExit(command.config);

	var containerName;
	var appName;

	if (command.args.length >= 2)
	{
		// Two params: containerName, appName
		//
		containerName = command.args[0];
		appName = command.args[1];
	}
	else if (command.args.length == 1)
	{
		// One param: containerName (appName is also containerName)
		//
		containerName = command.args[0];
		appName = containerName;
	}
	else
	{
		// No params: prompt for containerName and appName (appName defaults to containerName)
		//
		containerName = yield util.read({prompt: "Container name: "});
		if (!containerName || (containerName.length == 0))
		{
			console.log("Synchro container name cannot be empty");
			process.exit(1);
		}

		appName = yield util.read({prompt: "App name: ", default: containerName });
	}

	if (command.args.length > 1)
	{
	    appPath = command.args[1];
	}
	else
	{
		appPath = appContainer;
	}

	if (util.isAppInstalled(config, appPath))
	{
		console.log("Synchro app already installed at path '%s' in the active configuration", appPath);
		process.exit(1);
	}

	var modulesStore = util.getModulesStore(config);
	var appModuleStore;

	try
	{
		appModuleStore = yield modulesStore.getAppModuleStoreAwaitable(containerName);
	}
	catch (err)
	{
		console.log("Error:", err.message);
		process.exit(1);
	}

	var apps = config.get("APPS") || {};
	apps[appName] = { container: containerName };
	config.set("APPS", apps);
	config.save();

	// If we are adding an existing app from a module store other than the local file store, we need
	// to run the syncdeps logic here (to make sure any dependencies are available locally).
	//
	if (config.get('MODULESTORE_SERVICE') != 'FileModuleStore')
	{
		if (yield util.syncDeps(config, appModuleStore, appName))
		{
			console.log("Synchro app in container '%s' dependencies updated", appContainer);
		}
	}

	console.log("Synchro application '%s' added to the active configuration", appName);

}).catch(function(err){ console.log(err)});
