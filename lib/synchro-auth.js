#!/usr/bin/env node

var npm = require('npm');
var wait = require('wait.for');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro auth");
command.description('Authenticate to the Synchro.io server using your Synchro.io username/password');
command.option('-s, --server <value>', 'The server to which you want to authenticate');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    Upon successful authentication via this command, a download token will be configured in the npm');
    console.log('    configuation setting: synchro-auth-token, which will later be used by synchro init.');
    console.log('');
    console.log('    The server option defaults to synchro.io, and should not typically need to be specified');
    console.log('');
});command.parse(process.argv);

wait.launchFiber(function()
{
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

	var token = npm.config.get("synchro-auth-token");
	if (token)
	{
	    console.log("Existing token is:", token);		
	}

	util.promptAndAuthenticate(host);
});
