#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var wait = require('wait.for');
var read = require("read");
var request = require('request');
var npm = require('npm');

var synchroApi;
var synchroConfig;

function mkdirSync(path)
{
	try 
	{
		fs.mkdirSync(path);
	} 
	catch (err) 
	{
		// We'll ignore EEXIST
		if (err.code != 'EEXIST') throw e;
	}
}

exports.mkdirSync = function(path) 
{
	return mkdirSync(path);
}

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

exports.containerExists = function(moduleStore, containerName)
{
	return moduleStore.getAppContainers().indexOf(containerName) >= 0;
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

function getSecretAsync(host, email, password, callback)
{
	// This is doing the functional equivalent of basic authentication (sending email and password in
	// the clear as URL parameters).  This should be fine since a) we're on an SSL connection, and b) we've
	// made sure to suppress logging of this request on the server to avoid exposing the email/password
	// in the request logs.
	//
    var options = 
    {
        url: "https://" + host + "/getsecret?email=" + email + "&password=" + password,
        timeout: 5000
    }

    request(options, function(err, response, body)
    {
        var jsonResponse = (!err && (response.statusCode == 200)) ? JSON.parse(body) : null;
        var secret = jsonResponse && jsonResponse.secret;

        if (!err)
        {
            if (response.statusCode == 401) // 401 Unauthorized - pass message from server (in body) to user...
	        {
	        	err = new Error(response.body);
	        	err.code = response.statusCode;
	        }
	        else if (!err && !secret)
	        {
	        	err = new Error("Response from server was malformed (didn't contain token)");
	        }
	    }

        callback(err, secret);
    });	
}

exports.promptAndAuthenticate = function(host)
{
	host = host || "synchro.io";

	try
	{
		console.log("Enter the email address and password of your account on Synchro.io...");
		var email = wait.for(read, {prompt: "Email: "});
		var password = wait.for(read, {prompt: "Password: ", silent: true, replace: "*"});

		var secret = wait.for(getSecretAsync, host, email, password);
		console.log("Got token:", secret);
		wait.for(npm.commands.config, ["set", "synchro-auth-token", secret]);
		console.log("Token saved to npm config");

		return secret;		
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
			console.log("\nSynchro auth canceled by user");
		}
		else
		{
			console.log("Error:", err);			
		}
	}

	return null;
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

exports.npmInstall = function(cwd, callback)
{
	return npmInstall(cwd, callback);
}

exports.syncDeps = function(config, appModuleStore, appName)
{
	// Check to see if there are any dependencies in appDefinition
	//
	var appDefinition = appModuleStore.getAppDefinition();
	if (appDefinition["dependencies"] && (Object.keys(appDefinition["dependencies"]).length > 0))
	{
		var appLocalPath = path.resolve(config.get('APP_ROOT_PATH'), appName);

		console.log("Updating package.json from remote store");
		mkdirSync(appLocalPath); // Create local path if it doesn't exist...
		var packageData = appModuleStore.getModuleSource("package.json");
		wait.for(fs.writeFile, path.resolve(appLocalPath, "package.json"), packageData);

		// Do npm install in <container>
		//
		console.log("Installing app dependencies locally...");
		wait.for(npmInstall, appLocalPath);
		return true;
	}

	return false;
}

