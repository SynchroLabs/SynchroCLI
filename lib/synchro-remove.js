#!/usr/bin/env node

var co = require('co');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro remove");
command.usage('[options] <appName>');
command.description('Remove an app from the current configuration without removing its container from the module store');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <appName> is not provided on the command line, you will be prompted for it.');
    console.log('');
});
command.parse(process.argv);

co(function * ()
{
	var config = util.getConfigOrExit(command.config);

	var appName;
	if (command.args.length > 0)
	{
	    appName = command.args[0];
	}
	if (!appName)
	{
		appName = yield util.read({prompt: "App name: "});
	}

	if (!appName || (appName.length == 0))
	{
		console.log("Synchro app name cannot be empty");
		process.exit(1);
	}

	if (!util.isAppInstalled(config, appName))
	{
		console.log("Synchro app named '%s' not currently installed in the active configuration", appName);
		process.exit(1);
	}

	// Since we pass the isAppInstalled check above, we know that apps[appName] exists and can be removed
	//
	var apps = config.get("APPS");
	delete apps[appName]
	config.set("APPS", apps);
	config.save();
	console.log("Synchro application '%s' removed from the active configuration", appName);

}).catch(function(err){ console.log(err)});
