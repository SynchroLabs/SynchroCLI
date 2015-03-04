#!/usr/bin/env node

var request = require('request');
var read = require("read");
var npm = require('npm');
var wait = require('wait.for');

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

function getSecret(host, email, password, callback)
{
	// !!! This is doing the functional equivalent of basic authentication.  This would be fine if we
	//     we were on an SSL connection (which we will be in production).
	//
    var options = 
    {
        url: "http://" + host + "/getsecret?email=" + email + "&password=" + password,
        timeout: 5000
    }

    request(options, function(err, response, body)
    {
        var jsonResponse = (!err && (response.statusCode == 200)) ? JSON.parse(body) : null;
        if (!err && response.statusCode == 401)
        {
        	err = { code: response.statusCode, message: response.body };
        }
        //console.log("Response", response);
        callback(err, jsonResponse);
    });	
}

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

	try
	{
		var email = wait.for(read, {prompt: "Email: "});
		var password = wait.for(read, {prompt: "Password: ", silent: true, replace: "*"});

		secretObject = wait.for(getSecret, host, email, password);
		if (secretObject)
		{
			console.log("Got token:", secretObject.secret);
			wait.for(npm.commands.config, ["set", "synchro-auth-token", secretObject.secret]);
			console.log("Token saved to npm config");			
		}		
		else
		{
			console.log("Error, request not handled by server:", host);
		}
	}
	catch (err)
	{
		if (err.code == "ECONNREFUSED")
		{
			console.log("Error, unable to reach server:", host);
		}
		else if (err.code == 401)
		{
			// Auth failed, pass on message from server...
			console.log("Error:", err.message);
		}
		else if (err.message == "canceled")
		{
		    // ctrl-c
		    //
			console.log("\nSynchro auth canceled");
		}
		else
		{
			console.log("Error:", err);			
		}
	}
});
