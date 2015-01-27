var wait = require('wait.for');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro ls");
command.parse(process.argv);

wait.launchFiber(function()
{
	var config = util.getConfigOrExit();

	if (config["SYNCHRO_APPS"] && config["SYNCHRO_APPS"].length > 0)
	{
		for (var i = 0; i < config["SYNCHRO_APPS"].length; i++) 
		{
			console.log("Found app: %s", config["SYNCHRO_APPS"][i]);
		}		
	}
	else
	{
		console.log("No Synchro apps installed in this directory");
	}
});
