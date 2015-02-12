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

	// If app name supplied, use it...
	//
	// Else prompt for app name and other params...
	//

	// App:
	//
	// { "uriPath": "foo", "container": "foo" }

	//if (config["SYNCHRO_APPS"].indexOf(appName) == -1)
	{
		var liveConfig = util.getLiveConfig();

		var srcPath = path.resolve(__dirname, "../app-template");
		var dstPath = path.resolve(liveConfig.get("FILE_STORE_PATH"), appName);
		console.log("Copying Synchro app template to " + dstPath);
		wait.for(ncp, srcPath, dstPath);
	    console.log('Synchro app template copied');

		config["SYNCHRO_APPS"].push({ uriPath: appName, container: appName});
		util.putConfig(config);
		console.log("Synchro application '%s' created", appName);
	}
	//else
	//{
	//	console.log("Synchro application '%s' already existed in current directory", appName);
	//}
});
