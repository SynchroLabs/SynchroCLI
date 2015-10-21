#!/usr/bin/env node

var wait = require('wait.for');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro add");
command.usage('[options] <appContainer> <appPath>')
command.description('Add an app whose container exists in the module store to the current configuration.  If <appContainer> not supplied on the command line, you will be prompted for it.');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <appContainer> is not provided on the command line, you will be prompted for it.');
    console.log('    If <appPath> is not provided on the command line, the value of <appContainer> will be used.');
    console.log('');
});
command.parse(process.argv);

wait.launchFiber(function()
{
	var config = util.getConfigOrExit(command.config);

	var appContainer;
	var appPath;
	if (command.args.length > 0)
	{
	    appContainer = command.args[0];
	}
	if (!appContainer)
	{
		appContainer = wait.for(read, {prompt: "App container: "});
	}

	if (!appContainer || (appContainer.length == 0))
	{
		console.log("Synchro app container name cannot be empty");
		process.exit(1);
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
		appModuleStore = modulesStore.getAppModuleStore(appContainer);
	}
	catch (err)
	{
		console.log("Error:", err.message);
		process.exit(1);
	}

	var apps = config.get("APPS") || {};
	apps[appPath] = { container: appContainer };
	config.set("APPS", apps);
	config.save();

	// If we are adding an existing app from a module store other than the local file store, we need
	// to run the syncdeps logic here (to make sure any dependencies are available locally).
	//
    if (config.get('MODULESTORE_SERVICE') != 'FileModuleStore')
    {
		if (util.syncDeps(config, appModuleStore, appContainer))
		{
			console.log("Synchro app in container '%s' dependencies updated", appContainer);
		}
	}

	console.log("Synchro application container '%s' added to the active configuration at path '%s'", appContainer, appPath);
});