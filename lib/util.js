var fs = require('fs');
var wait = require('wait.for');

exports.getConfig = function()
{
	try
	{
		return JSON.parse(wait.for(fs.readFile, 'config.json', 'utf8'));
	}
	catch (err)
	{
		return null;
	}
}

exports.getConfigOrExit = function()
{
	var config = module.exports.getConfig();
	if (!config)
	{
		console.log("Synchro has not yet been initialized in this directory, exiting");
		process.exit(1);
	}

	return config;
}

exports.putConfig = function(config)
{
	wait.for(fs.writeFile, 'config.json', JSON.stringify(config), 'utf8');
}