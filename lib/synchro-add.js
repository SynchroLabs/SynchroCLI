#!/usr/bin/env node

var wait = require('wait.for');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro add");
command.usage('[options] <appname>')
command.option('-c, --config <value>', 'Use the specified configuration file');
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

	if (util.isAppInstalled(config, appName))
	{
		console.log("Synchro app named '" + appName + "' already installed in the active configuration");
		process.exit(1);
	}

	var modulesStore = util.getModulesStore(config);
	var appModuleStore;

	try
	{
		appModuleStore = modulesStore.getAppModuleStore(appName);
	}
	catch (err)
	{
		console.log("Error:", err.message);
		process.exit(1);
	}

	var apps = config.get("SYNCHRO_APPS") || [];
	apps.push({ uriPath: appName, container: appName});
	config.save();
	
	console.log("Synchro application '%s' added to the active configuration", appName);
});