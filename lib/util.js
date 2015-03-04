#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var wait = require('wait.for');

var synchroApi;
var synchroConfig;

exports.loadSynchro = function()
{
	try
	{
		// These will fail if Synchro not installed in cwd
		//
		var appDirNodeModules = path.resolve(process.cwd(), "node_modules");
		synchroApi = require(path.resolve(appDirNodeModules, 'synchro-api'));
		synchroConfig = require(path.resolve(appDirNodeModules, 'synchro-api', 'synchro-config'));
	}
	catch (err)
	{
		return false;
	}

	return true;
}

// This call will attempt to load Synchro at startup.  The reason it is broken out into an exported function is
// that the "init" command needs to re-attempt this after installing Synchro in order to do some config stuff.
//
exports.loadSynchro();

exports.isSynchroInstalled = function()
{
	return synchroApi != null;
}

exports.isAppInstalled = function(config, appName)
{
	var apps = config.get("SYNCHRO_APPS") || [];
	for (var i = 0; i < apps.length; i++) 
	{
		// App:
		//
		// { "uriPath": "foo", "container": "foo" }
		//
		var app = apps[i];
		if ((app.container == appName) || (app.uriPath == appName))
		{
			return true;
		}
	}

	return false;
}

exports.getConfig = function(configFile)
{
	var config;

	try
	{
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

exports.getConfigOrExit = function(configFile)
{
	if (exports.isSynchroInstalled())
	{
		return exports.getConfig(configFile);
	}
	else
	{
		console.log("Synchro has not yet been initialized in this directory, exiting");
		process.exit(1);		
	}
}

exports.getModulesStore = function(config)
{
	var moduleStoreSpec =
	{
        packageRequirePath: config.get('MODULESTORE_PACKAGE'),
        serviceName: config.get('MODULESTORE_SERVICE'),
        serviceConfiguration: config.get('MODULESTORE')
	}

	return synchroApi.createServiceFromSpec(moduleStoreSpec);
}
