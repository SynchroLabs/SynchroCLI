#!/usr/bin/env node

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

exports.getLiveConfig = function(configFile)
{
	var config;

	try
	{
	    var synchroConfig = require(process.cwd() + "/node_modules/synchro-api/synchro-config");
	    config = synchroConfig.getConfig(configFile); 
	    console.log("Got config from synchro-api - " + config.configDetails);
	}
	catch (err)
	{
	    console.log("Failed to load synchro config from installed Synchro instance");
	    console.log("Err: ", err);
	}	

	return config;
}
