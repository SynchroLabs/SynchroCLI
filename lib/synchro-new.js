#!/usr/bin/env node

var wait = require('wait.for');
var read = require("read");
var fs = require('fs');
var path = require('path');

var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro new");
command.usage('[options] <appContainer> <appPath>');
command.description('Create a new application in the module store and add it to the current configuration.');
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

function validateContainerName(appContainer)
{
	// Lower-case letters, numbers, and dashes (dashes only allowed when separating two non-dash characters, meaning 
	// no leading or trailing dashes and no consecutive dashes).
	//
	// Should be legal in all contexts (uri enpoint part, file system container, Azure container, etc)
	//
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(appContainer);
}

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
	else if (!validateContainerName(appContainer))
	{
		console.log("Synchro container name can only contain lower case letters, numbers, and dash characters");
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

	// We use the config object to create the module store, then create the new app in the module store
	// using appropriate module store methods (so this should work with any module store provider).
	//     
	var modulesStore = util.getModulesStore(config);

	try
	{
		modulesStore.createAppContainer(appContainer);
	}
	catch (err)
	{
		console.log("Error:", err.message);
		process.exit(1);
	}

	var appModuleStore = modulesStore.getAppModuleStore(appContainer);

	var srcPath = path.resolve(__dirname, "../app-template");
    var files = wait.for(fs.readdir, srcPath);
    for (var i = 0; i < files.length; i++) 
    {
    	var fileName = files[i];
        var filePath = path.resolve(srcPath, fileName);
        if (fs.statSync(filePath).isFile())
        {
        	console.log("Processing file:", fileName);
        	var content = wait.for(fs.readFile, filePath, { encoding: "utf8" });

    		content = content.replace("{{{name}}}", appContainer);
    		content = content.replace("{{{description}}}", appContainer);

        	appModuleStore.putModuleSource(fileName, content);
        }
    }

	var apps = config.get("APPS") || {};
	apps[appPath] = { container: appContainer };
	config.set("APPS", apps);
	config.save();

	console.log("Synchro application container '%s' created and added to the active configuration at path '%s'", appContainer, appPath);
});
