#!/usr/bin/env node

var wait = require('wait.for');
var read = require("read");
var fs = require('fs');
var path = require('path');

var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro new");
command.usage('[options] <appName> <description>');
command.description('Create a new application in the module store and add it to the current configuration.');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <appName> is not provided on the command line, you will be prompted for both app name and description.');
    console.log('    If only <appName> is provided on the command line, you will not be prompted for description.');
    console.log('');
    console.log('    Note: As the description will typically contain spaces, it should be quoted if passed on the command line.');
    console.log('');
});
command.parse(process.argv);

// !!! Allow for independant specification of app name, container, and uri path?  Resolve conflicts if existing
//     apps are installed with the same name, in the same container, or at the same uri path.
//

function validateAppName(appName)
{
	// Lower-case letters, numbers, and dashes (dashes only allowed when separating two non-dash characters, meaning 
	// no leading or trailing dashes and no consecutive dashes).
	//
	// Should be legal in all contexts (uri enpoint part, file system container, Azure container, etc)
	//
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(appName);
}

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

	// !!! Will need to apply the below tests to container and uri path when we collect those separately
	//
	if (!appName || (appName.length == 0))
	{
		console.log("Synchro app name cannot be empty");
		process.exit(1);
	}
	else if (!validateAppName(appName))
	{
		console.log("Synchro app name can only contain lower case letters, numbers, and dash characters");
		process.exit(1);
	}

	if (util.isAppInstalled(config, appName))
	{
		console.log("Synchro app named '%s' already installed in the active configuration", appName);
		process.exit(1);
	}

	var appDescription = appName;
	if (command.args.length == 0)
	{
		appDescription = wait.for(read, {prompt: "App description: "});
	}

	// We use the config object to create the module store, then create the new app in the module store
	// using appropriate module store methods (so this should work with any module store provider).
	//     
	var modulesStore = util.getModulesStore(config);

	try
	{
		modulesStore.createAppContainer(appName);
	}
	catch (err)
	{
		console.log("Error:", err.message);
		process.exit(1);
	}

	var appModuleStore = modulesStore.getAppModuleStore(appName);

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

    		content = content.replace("{{{name}}}", appName);
    		content = content.replace("{{{description}}}", appDescription);

        	appModuleStore.putModuleSource(fileName, content);
        }
    }

	var apps = config.get("SYNCHRO_APPS") || [];
	apps.push({ uriPath: appName, container: appName});
	config.set("SYNCHRO_APPS", apps);
	config.save();

	console.log("Synchro application '%s' created", appName);
});
