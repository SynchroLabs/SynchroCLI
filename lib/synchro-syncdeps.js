#!/usr/bin/env node

var co = require('co');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro syncdeps");
command.usage('[options] <appContainer>');
command.description('Ensure that the dependencies of the specified Synchro app are installed on the local server');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <appContainer> is not provided on the command line, you will be prompted for it.');
    console.log('');
});
command.parse(process.argv);

co(function * ()
{
	var config = util.getConfigOrExit(command.config);

    if (config.get('MODULESTORE_SERVICE') == 'FileModuleStore')
    {
    	console.log("");
    	console.log("WARNING");
    	console.log("The syncdeps command is designed to install dependencies from remote Synchro apps");
    	console.log("onto the local server.  You are curretly using the local file module store, so your");
    	console.log("module dependencies don't require syncdeps, and can be managed normally using npm.");
    	console.log("No action taken.");
    	process.exit(1);
    }

	var moduleStore = util.getModulesStore(config);

	var appContainer;
	if (command.args.length > 0)
	{
	    appContainer = command.args[0];
	}
	if (!appContainer)
	{
		appContainer = yield util.read( {prompt: "App container: "});
	}

	if (!appContainer || (appContainer.length == 0))
	{
		console.log("Synchro app container name cannot be empty");
		process.exit(1);
	}

	// Find the app in the module store...
	//
	var appModuleStore;
	var appContainers = yield moduleStore.getAppContainersAwaitable() || [];
	if (appContainers.length > 0)
	{
		for (var i = 0; i < appContainers.length; i++) 
		{
			if (appContainers[i] == appContainer)
			{
				appModuleStore = yield moduleStore.getAppModuleStoreAwaitable(appContainer);
			}
		}
	}

	if (appModuleStore)
	{
		if (yield util.syncDeps(config, appModuleStore, appContainer))
		{
			console.log("Synchro app in container '%s' local dependencies updated", appContainer);
		}
		else
		{
			console.log("Synchro app in container '%s' has no dependencies, no action taken", appContainer);
		}
	}
	else
	{
		console.log("Synchro app container '%s' not present in module store", appContainer);
	}

}).catch(function(err){ console.log(err) });
