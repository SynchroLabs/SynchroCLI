#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var wait = require('wait.for');
var read = require("read");
var request = require('request');
var npm = require('npm');
var tarStream = require('tar-stream');
var zlib = require('zlib');
var isGzip = require('is-gzip');
var isTar = require('is-tar');
var tarFs = require('tar-fs');

var synchroApi;
var synchroConfig;

function waitInterval(intervalMillis, callback)
{
    setTimeout(function(){callback()}, intervalMillis);
}

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
	var apps = config.get("APPS") || {};
	return (apps[appName] != null);
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

exports.getUrl = function(url, callback)
{
    var options = 
    {
        url: url,
        encoding: null, // Required to get a buffer back with binary contents
        timeout: 5000
    }

    request(options, function(err, response, body)
    {
    	if (err)
    	{
    		callback(err);
    	}
        else if (response.statusCode == 200)
        {
	        callback(err, body);
        }
        else
        {
        	err = new Error("Status " + response.statusCode + " " + response.statusMessage + ", url: " + url);
        	err.code = response.statusCode;
        	callback(err);
        }
    });	
}

function getSecretAsync(host, email, password, callback)
{
	// This is doing the functional equivalent of basic authentication (sending email and password in
	// the clear as URL parameters).  This should be fine since a) we're on an SSL connection, and b) we've
	// made sure to suppress logging of this request on the server to avoid exposing the email/password
	// in the request logs.
	//
	if (!/^https?:\/\//i.test(host)) 
	{
		host = "https://" + host;
    }

    var options = 
    {
        url: host + "/getsecret?email=" + email + "&password=" + password,
        timeout: 5000
    }

    request(options, function(err, response, body)
    {
        var jsonResponse = (!err && (response.statusCode == 200)) ? JSON.parse(body) : null;
        var secret = jsonResponse && jsonResponse.secret;

        if (!err)
        {
            if ((response.statusCode == 401) || (response.statusCode == 403)) 
	        {
	            // Unauthorized/Forbidden - pass message from server (in body) to user...
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

		// There was (is) an intermittent bug where when completing the read of email address and 
		// immediately starting the read of password, the email address is echoed to a new line and 
		// the password ends waiting before there is a chance to type anything.  I'm not sure what's 
		// causing this, but I'm assuming some signal isn't handled yet, or the stream isn't empty yet, 
		// or something.  This short wait seems to fix it (in the case where it happens, which is far
	    // less frequent, you still see the email address get echoed to a new line, but not it waits
	    // for you to enter the password).
		//
		wait.for(waitInterval, 50);

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
		else if ((err.code == 401) || (err.code == 403))
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

function getDownloadServer(command)
{
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

	return host;
}

function getDownloadToken(command, host)
{
	// Auth token comes from command line, failing that, from node config, failing that, prompt and auth interactively
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
		token = exports.promptAndAuthenticate(host);
		if (!token)
		{
			// If auth was attempted and failed, it will report error message to console, so we can just bail...
			//
			process.exit(1);			
		}
	} 

	return token;
}

function fileExists(filePath)
{
	try
	{
	    return fs.statSync(filePath).isFile();
	}
	catch (err)
	{
		return false;
	}
}

function extractFilesAsync(location, contents, callback)
{
	// !!! What about overwriting synchro-apps/package.json - we might have added "default" dependencies, 
	//     but the user might also have updated the file.

	var extract = tarFs.extract(location, {
  		dmode: 0555, // all dirs and files should be readable
  		fmode: 0444,
  		map: function(header) 
  		{
  			// Packages made with npm pack have a top level 'package' container...
  			//
  			if (header.name.indexOf('package/') === 0)
  			{
  				header.name = header.name.replace(/^package\//, '');
  			}
    		return header;
    	},
    	ignore: function(name) 
    	{
    		// Don't extract config.json if it exists!
            return ((name === 'config.json') && fileExists(path.resolve(location, "config.json")));
		}
  	});

	extract.on('finish', callback);
	extract.on('error', callback);

	extract.end(contents);
}

exports.downloadAndInstallServer = function(command)
{
	wait.for(npm.load);

	var host = getDownloadServer(command);
	var token = getDownloadToken(command, host);

	var serverPath = "http://" + host + "/dist/" + token + "/synchro-server";
	if (command.serverVersion)
	{
		serverPath += "-" + command.serverVersion;
	}
	serverPath += ".tgz";

	console.log("Downloading server from: " + serverPath);

	var fileContents = wait.for(exports.getUrl, serverPath);
	if (!isGzip(fileContents))
	{
		// Not a gzip file
		//
		console.log("Error: File was not a compressed archive");
		process.exit(1);	
	}
	
	var unzipped = wait.for(zlib.unzip, fileContents);
	if (!isTar(unzipped))
	{
		// Not a tar archive inside the gzip
		//
		console.log("Error: File did not contain a package archive");
		process.exit(1);	
	}

	wait.for(extractFilesAsync, './', unzipped); // !!! process.cwd()?
	console.log("Extracted files");

	// Use the host and token to customize the package.json...
	//
	var packageData = wait.for(fs.readFile,'./package.json').toString();
    packageData = packageData.replace(/\[host\]/g, host);
    packageData = packageData.replace(/\[token\]/g, token);
    wait.for(fs.writeFile, './package.json', packageData);

	// Use the host and token to customize the npm-shrinkwrap.json...
	//
	var packageData = wait.for(fs.readFile,'./npm-shrinkwrap.json').toString();
    packageData = packageData.replace(/\[host\]/g, host);
    packageData = packageData.replace(/\[token\]/g, token);
    wait.for(fs.writeFile, './npm-shrinkwrap.json', packageData);

    // Let npm install the Synchro Server dependencies...
    //
    console.log('npm install of Synchro dependencies starting...');
    wait.for(npmInstall, process.cwd());
	console.log("npm install of Synchro dependencies completed");
}

exports.installAppDependencies = function(config)
{
    console.log('npm install of Synchro app dependencies starting...');
    wait.for(npmInstall, path.resolve(process.cwd(), config.get('APP_ROOT_PATH')));
	console.log("npm install of Synchro app dependencies completed");
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

exports.syncDeps = function(config, appModuleStore, appContainer)
{
	// Check to see if there are any dependencies in appDefinition
	//
	var appDefinition = appModuleStore.getAppDefinition();
	if (appDefinition["dependencies"] && (Object.keys(appDefinition["dependencies"]).length > 0))
	{
		var appLocalPath = path.resolve(config.get('APP_ROOT_PATH'), appContainer);

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

