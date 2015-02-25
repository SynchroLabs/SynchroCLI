#!/usr/bin/env node

var wait = require('wait.for');
var read = require("read");
var fs = require('fs');
var path = require('path');
var ncp = require('ncp').ncp;

var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro new");
command.usage('[options] <appname>')
command.option('-c, --config <value>', 'Use the specified configuration file');
command.parse(process.argv);

// !!! If the services in use are not "local", then the ncp method here is not going to work.  In a perfect
//     world we would instantiate the services, then use the module store interface to determine if the container
//     exists, create the container, and create/populate the container.  This would mean we could use this 
//     command to create apps even if they were hosted on Azure or AWS stores.
//

// !!! Prompt for additional data (description?) to populate synchro.json.
//

// !!! Allow for independant specification of app name, container, and uri path?  Resolve conflicts if existing
//     apps are installed with the same name, in the same container, or at the same uri path.
//

function validateAppName(appName)
{
	// Letters, numbers, underscore, and dash - should be legal in all contexts, including container (path) and uri
	//
    return /^[-_a-zA-Z0-9]*$/.test(appName);
}

wait.launchFiber(function()
{
	var config = util.getConfigOrExit(command.config);

	apps = config.get("SYNCHRO_APPS");
	if (!apps)
	{
		apps = [];
	}

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
		console.log("Synchro app name can only contain letters, numbers, underscore, and dash characters");
		process.exit(1);
	}

	for (var i = 0; i < apps.length; i++) 
	{
		// App:
		//
		// { "uriPath": "foo", "container": "foo" }
		//
		var app = apps[i];
		if ((app.container == appName) || (app.uriPath == appName))
		{
			console.log("Synchro application '%s' already exists", appName);
			process.exit(1);
		}
	}

	// !!! In a perfect world, we'd use the config object to create the module store, then create the new app
	//     in the module store using appriate module store methods.   The below requires that the file module
	//     store be in use.
	//     


	var srcPath = path.resolve(__dirname, "../app-template");
	var dstPath = path.resolve(config.get("MODULESTORE:directory"), appName);
	console.log("Copying Synchro app template to " + dstPath);
	wait.for(ncp, srcPath, dstPath);
    console.log('Synchro app template copied');

    // !!! Probably want to do some template replacement to customize app with appName...

	apps.push({ uriPath: appName, container: appName});
	config.save();
	console.log("Synchro application '%s' created", appName);
});
