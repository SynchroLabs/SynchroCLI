#!/usr/bin/env node

var co = require('co');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro remove");
command.usage('[options] <appPath>');
command.description('Remove an app from the current configuration without removing its container from the module store');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <appPath> is not provided on the command line, you will be prompted for it.');
    console.log('');
});
command.parse(process.argv);

co(function * ()
{
	var config = util.getConfigOrExit(command.config);

	var appPath;
	if (command.args.length > 0)
	{
	    appPath = command.args[0];
	}
	if (!appPath)
	{
		appPath = yield util.read({prompt: "App path: "});
	}

	if (!appPath || (appPath.length == 0))
	{
		console.log("Synchro app path cannot be empty");
		process.exit(1);
	}

	if (!util.isAppInstalled(config, appPath))
	{
		console.log("No Synchro app installed at path '%s' in the active configuration", appPath);
		process.exit(1);
	}

	// Since we pass the isAppInstalled check above, we know that apps[appPath] exists and can be removed
	//
	var apps = config.get("APPS");
	delete apps[appPath]
	config.set("APPS", apps);
	config.save();
	console.log("Synchro application '%s' removed from the active configuration", appPath);

}).catch(function(err){ console.log(err)});
