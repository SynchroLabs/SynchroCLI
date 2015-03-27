#!/usr/bin/env node

var wait = require('wait.for');
var util = require('./util');

var fs = require('fs');
var path = require('path');
var ncp = require('ncp').ncp;
var npm = require('npm');

var commander = require('commander');
var command = new commander.Command("synchro init");
command.description('Download, install, and configure a Synchro server in the current working directory.');
command.option('-p, --port <value>', 'The port on which the Synchro server will listen', parseInt);
command.option('-d, --debug-base-port <value>', 'The starting port for the debugging engine', parseInt);
command.option('-n, --no-studio', 'The Synchro Studio will not be enabled');
command.option('-s, --download-server <value>', 'The server from which to get Synchro packages');
command.option('-t, --download-token <value>', 'The auth token to use in getting Synchro packages');
command.parse(process.argv);

if (command.debugBasePort && command.debugBasePort <= 1024)
{
	console.log("Error, debug base port must be greater than 1024, was:", command.debugBasePort);
	process.exit(1);
}

function npmInstall(cwd, callback)
{
	var exec = require('child_process').exec;
	var options = 
	{
		stdio: 'inherit',
		cwd: cwd
	}

	var child = exec('npm install', options, function(err, stdout, stderr) 
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
	if (command.downloadServer)
	{
		host = command.downloadServer;
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
	var token;
	if (command.downloadToken)
	{
		token = command.downloadToken;
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
		// If we don't have a token, let's try to auth...
		//
		token = util.promptAndAuthenticate(host);
		if (!token)
		{
			// If auth was attempted and failed, it will report error message to console, so we can just bail...
			//
			process.exit(1);			
		}
	} 

	// Use the host and token retrieved above to customize the package.json...
	//
	var packageData = wait.for(fs.readFile,'./package.json').toString();
    packageData = packageData.replace(/\[host\]/g, host);
    packageData = packageData.replace(/\[token\]/g, token);
    wait.for(fs.writeFile, './package.json', packageData);

    // Let npm install the dependencies of our package.json...
    //
    console.log('npm install of Synchro dependencies starting...');
    wait.for(npmInstall, process.cwd());
	console.log("npm install of Synchro dependencies completed");

	util.loadSynchro();

	var config = util.getConfigOrExit(command.config);

    console.log('npm install of Synchro app dependencies starting...');
    wait.for(npmInstall, path.resolve(process.cwd(), config.get('APP_ROOT_PATH')));
	console.log("npm install of Synchro app dependencies completed");

	// Process command params (updating config)
	//
	if (command.port)
	{
		config.set("PORT", command.port);
	}
	if (command.debugBasePort)
	{
		config.set("DEBUG_BASE_PORT", command.debugBasePort);
	}
	if (!command.studio)
	{
		config.set("NOSTUDIO", true);
	}
	config.save();

	console.log("Synchro is now initialized in this directory");    	
});
