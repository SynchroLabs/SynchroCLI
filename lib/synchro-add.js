#!/usr/bin/env node

var wait = require('wait.for');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro add");
command.usage('[options] <appname>')
command.description('Add an app whose container exists in the module store to the current configuration.  If <appname> not supplied on the command line, you will be prompted for it.');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <appname> is not provided on the command line, you will be prompted for it.');
    console.log('');
});
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
		console.log("Synchro app named '%s' already installed in the active configuration", appName);
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
	config.set("SYNCHRO_APPS", apps);
	config.save();

	console.log("Synchro application '%s' added to the active configuration", appName);
});