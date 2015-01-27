var wait = require('wait.for');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro new");
command.usage('[options] <appname>')
command.parse(process.argv);

if (command.args.length <= 0)
{
	console.log("No app name specified, exiting");
	process.exit(1);
}

var appName = command.args[0];

wait.launchFiber(function()
{
	var config = util.getConfigOrExit();

	if (!config["SYNCHRO_APPS"])
	{
		config["SYNCHRO_APPS"] = [];
	}

	if (config["SYNCHRO_APPS"].indexOf(appName) == -1)
	{
		config["SYNCHRO_APPS"].push(appName);
		util.putConfig(config);
		console.log("Synchro application '%s' added to current directory", appName);
	}
	else
	{
		console.log("Synchro application '%s' already existed in current directory", appName);
	}
});
