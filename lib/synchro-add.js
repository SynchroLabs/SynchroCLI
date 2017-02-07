#!/usr/bin/env node

var co = require('co');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro add");
command.usage('[options] <appContainer> <appPath>')
command.description('Add an app whose container exists in the module store to the current configuration.');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <appContainer> is provided on the command line and <appPath> is not, the path will default to the container name.');
    console.log('    If neither <appContainer> nor <appPath> are provided on the command line, you will be prompted for both.');
    console.log('');
});
command.parse(process.argv);

co(function * ()
{
	var config = util.getConfigOrExit(command.config);
	var modulesStore = yield util.getModulesStoreAwaitable(config);
	var appsConfig = yield util.getAppsConfig(config, modulesStore);

	var appContainer;
	var appPath;

	if (command.args.length >= 2)
	{
		// Two params: container, path
		//
		appContainer = command.args[0];
		appPath = command.args[1];
	}
	else if (command.args.length == 1)
	{
		// One param: container (path is also container)
		//
		appContainer = command.args[0];
		appPath = appContainer;
	}
	else
	{
		// No params: prompt for appContainer and appPath (appPath defaults to appContainer)
		//
		appContainer = yield util.read({prompt: "App container: "});
		if (!appContainer || (appContainer.length == 0))
		{
			console.log("Synchro app container name cannot be empty");
			process.exit(1);
		}

		appPath = yield util.read({prompt: "App path: ", default: appContainer });
	}

	if (appsConfig.isAppInstalled(appPath))
	{
		console.log("Synchro app already installed at path '%s' in the active configuration", appPath);
		process.exit(1);
	}

	var appModuleStore;
	try
	{
		appModuleStore = yield modulesStore.getAppModuleStoreAwaitable(appContainer);
	}
	catch (err)
	{
		console.log("Error:", err.message);
		process.exit(1);
	}

	appsConfig.APPS[appPath] = { container: appContainer };
	yield appsConfig.save();

	// If we are adding an existing app from a module store other than the local file store, we need
	// to run the syncdeps logic here (to make sure any dependencies are available locally).
	//
	if (config.get('MODULESTORE_SERVICE') != 'FileModuleStore')
	{
		if (yield util.syncDeps(config, appModuleStore, appContainer))
		{
			console.log("Synchro app in container '%s' dependencies updated", appContainer);
		}
	}

	console.log("Synchro application '%s' added to the active configuration", appPath);

}).catch(function(err)
{ 
	console.log(err);
	process.exit(1);
});
