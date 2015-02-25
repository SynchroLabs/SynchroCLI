#!/usr/bin/env node

var wait = require('wait.for');
var util = require('./util');

var fs = require('fs');
var path = require('path');
var ncp = require('ncp').ncp;
var npm = require('npm');

var commander = require('commander');
var command = new commander.Command("synchro init");
command.option('-s, --server <value>', 'The server from which you want to get Synchro packages');
command.option('-t, --token <value>', 'The Synchro auth token to use in getting packages');
command.parse(process.argv);

function npmInstall(callback)
{
	var exec = require('child_process').exec;
	var child = exec('npm install', {stdio: 'inherit'}, function(err, stdout, stderr) 
	{
	    if (err) 
	    {
	    	console.log("npm install failed with error code", err.code);
	    	console.log("Error details: ", stderr);
	    	callback(err);
	    }
	    else
	    {
		    callback();
	    }
	});

	child.stdout.on('data', function(data) {
        process.stdout.write(data.toString());
    });
    child.stderr.on('data', function(data) {
        process.stderr.write(data.toString());
    });
}

wait.launchFiber(function()
{
	if (util.isSynchroInstalled())
	{
		console.log("Synchro has already been initialized in this directory, exiting");
		process.exit(1);
	}

	var srcPath = path.resolve(__dirname, "../server-template");
	var dstPath = path.resolve(process.cwd());

	console.log("Copying Synchro instance to " + dstPath);

	wait.for(ncp, srcPath, dstPath);
    console.log('Synchro instance copied');

	wait.for(npm.load);

	// host - Priority: command line parameter, npm config, default (synchro.io)
	//
	var host = "synchro.io";
	if (command.server)
	{
		host = command.server;
	}
	else
	{
		var hostFromNpm = npm.config.get("synchro-host");
		if (hostFromNpm)
		{
			host = hostFromNpm;
		}
	}

	// Auth token comes from command line, failing that, from node config, failing that, err
	//
	if (command.token)
	{
		token = command.token;
	}
	else
	{
		var tokenFromNpm = npm.config.get("synchro-auth-token");
		if (tokenFromNpm)
		{
			token = tokenFromNpm;
		}
	}

	if (!token)
	{
		console.log("No auth token was specified on the command line, nor was one available from npm config.  Please run 'synchro auth'.");
		process.exit(1);
	}

	// Use the host and token retrieved above to customize the package.json...
	//
	var packageData = wait.for(fs.readFile,'./package.json').toString();
    packageData = packageData.replace(/\[host\]/g, host);
    packageData = packageData.replace(/\[token\]/g, token);
    wait.for(fs.writeFile, './package.json', packageData);

    // Let npm install the dependencies of our package.json...
    //
    console.log('npm install of Synchro instance starting...');
    wait.for(npmInstall);
	console.log("npm install completed");

	console.log("Synchro is now initialized in this directory");    	
});
