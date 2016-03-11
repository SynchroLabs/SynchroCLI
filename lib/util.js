#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var co = require('co');
var read = require("read");
var request = require('request');
var npm = require('npm');
var tarStream = require('tar-stream');
var zlib = require('zlib');
var isGzip = require('is-gzip');
var isTar = require('is-tar');
var tarFs = require('tar-fs');
var lodash = require('lodash');
var semver = require('semver');

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

        // Synchro CLI doesn't use Log4js, but it will call into various synchro-api modules that do.
        // If we don't configure logging before we do that, we get ALL logging events to the console.
        // So we call into the config and logging modules of the installed Synchro Server and do the
        // logging config...
        //
        var log4js = require(path.resolve(appDirNodeModules, "log4js"));
        var config = synchroConfig.getConfig('LOG4JS_CONFIG');
        log4js.configure(config);
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


exports.validateAppPath = function(appPath)
{
    // Lower-case letters, numbers, and dashes (dashes only allowed when separating two non-dash characters, meaning 
    // no leading or trailing dashes and no consecutive dashes).
    //
    // Should be legal in all contexts (uri enpoint part, file system container, Azure container, etc)
    //
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(appPath);
}

exports.isSynchroInstalled = function()
{
	return synchroApi != null;
}

exports.isAppInstalled = function(config, appPath)
{
	var apps = config.get("APPS") || {};
    return !!apps[appPath];
}

exports.installedAppsFromContainer = function(config, container)
{
    var apps = config.get("APPS") || {};
    var installedApps = [];
    for (var app in apps) 
    {
        if (apps[app].container && (apps[app].container === container))
        {
            installedApps.push(app);
        }
    }

    return installedApps;
}

exports.installedappPathsFromContainer = function(config, container)
{
    var installedApps = exports.installedAppsFromContainer(config, container);
    if (installedApps.length > 0)
    {
        return installedApps.join(", ");
    }

    return false;
}

exports.containerExists = function * (moduleStore, appContainer)
{
	return (yield moduleStore.getAppContainersAwaitable()).indexOf(appContainer) >= 0;
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

exports.promptAndAuthenticate = function * (host)
{
	host = host || "synchro.io";

	try
	{
		console.log("Enter the email address and password of your account on Synchro.io...");
		var email = yield utilRead( {prompt: "Email: "});

		// There was (is) an intermittent bug where when completing the read of email address and 
		// immediately starting the read of password, the email address is echoed to a new line and 
		// the password ends waiting before there is a chance to type anything.  I'm not sure what's 
		// causing this, but I'm assuming some signal isn't handled yet, or the stream isn't empty yet, 
		// or something.  This short wait seems to fix it (in the case where it happens, which is far
	    // less frequent, you still see the email address get echoed to a new line, but not it waits
	    // for you to enter the password).
		//
		yield utilWaitFor(waitInterval, 50);

		var password = yield utilRead( {prompt: "Password: ", silent: true, replace: "*"});

		var secret = yield utilWaitFor(getSecretAsync, host, email, password);
		console.log("Got token:", secret);
		yield utilWaitFor(npm.commands.config, ["set", "synchro-auth-token", secret]);
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

function * getDownloadToken (command, host)
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
		token = yield exports.promptAndAuthenticate(host);
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
    //
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

function runCommand(command, callback) 
{
    var exec = require('child_process').exec;
    exec(command, function(err, stdout, stderr) 
    {
        if (err) 
        {
            callback(err);
        }
        else if (stderr.length > 0) 
        {
            callback(new Error(stderr.toString()));
        }
        else 
        {
            callback(null, stdout.toString().trim());
        }
    });
}

exports.downloadAndInstallServer = function * (command)
{
	yield utilWaitFor(npm.load);

	var host = getDownloadServer(command);
	var token = yield getDownloadToken(command, host);

	var serverPath = "http://" + host + "/dist/" + token + "/synchro-server";
	if (command.serverVersion)
	{
        // If an explicit version was provided, make sure it's not prior to 1.3.0 (since those versions can't be installed because their
        // module store implementations rely on being called under fibers instead of co).
        //
        if (semver.satisfies(command.serverVersion, "< 1.3.0"))
        {
            console.log("Error: Cannot install Synchro server version prior to 1.3.0, specified version was: " + command.serverVersion);
            process.exit(1);
        }

		serverPath += "-" + command.serverVersion;
	}
	serverPath += ".tgz";

	console.log("Downloading server from: " + serverPath);

	var fileContents = yield utilWaitFor(exports.getUrl, serverPath);
	if (!isGzip(fileContents))
	{
		// Not a gzip file
		//
		console.log("Error: File was not a compressed archive");
		process.exit(1);
	}
	
	var unzipped = yield utilWaitFor(zlib.unzip, fileContents);
	if (!isTar(unzipped))
	{
		// Not a tar archive inside the gzip
		//
		console.log("Error: File did not contain a package archive");
		process.exit(1);
	}

	yield utilWaitFor(extractFilesAsync, './', unzipped); // !!! process.cwd()?
	console.log("Extracted files");

	var packageData = (yield utilWaitFor(fs.readFile,'./package.json')).toString();
    var pkg = JSON.parse(packageData);

    // Use the host and token to customize the package.json...
    //
    packageData = packageData.replace(/\[host\]/g, host);
    packageData = packageData.replace(/\[token\]/g, token);
    yield utilWaitFor(fs.writeFile, './package.json', packageData);

	// Use the host and token to customize the npm-shrinkwrap.json...
	//
	var packageData = (yield utilWaitFor(fs.readFile,'./npm-shrinkwrap.json')).toString();
    packageData = packageData.replace(/\[host\]/g, host);
    packageData = packageData.replace(/\[token\]/g, token);
    yield utilWaitFor(fs.writeFile, './npm-shrinkwrap.json', packageData);

    // Let npm install the Synchro Server dependencies...
    //
    console.log('npm install of Synchro dependencies starting...');
    yield utilWaitFor(npmInstall, process.cwd());
	console.log("npm install of Synchro dependencies completed");

    return pkg.engines && pkg.engines.node;
}

exports.validatePackageNodeVersion = function * (pkgNodeVersion)
{
    var nodeVersion;

    try
    {
        nodeVersion = yield utilWaitFor(runCommand, "node -v");
        if (nodeVersion.indexOf("v") == 0)
        {
            nodeVersion = nodeVersion.slice(1);
        }
    }
    catch (err) { }

    if (pkgNodeVersion)
    {
        if (!nodeVersion)
        {
            console.log("WARNING: Node version could not be determined.  Installed Synchro requires:", pkgNodeVersion);
        }
        else if (!semver.satisfies(nodeVersion, pkgNodeVersion))
        {
            console.log("WARNING: Installed Node version '%s' does not meet installed Synchro requirement of '%s'", nodeVersion, pkgNodeVersion);
        }
    }
}

exports.installAppRootDependencies = function * (config)
{
    console.log('npm install of Synchro app dependencies starting...');
    yield utilWaitFor(npmInstall, path.resolve(process.cwd(), config.get('APP_ROOT_PATH')));
	console.log("npm install of Synchro app dependencies completed");
}

exports.installAppDependencies = function * (config, appContainer)
{
    var appLocalPath = path.resolve(config.get('APP_ROOT_PATH'), appContainer);
    yield utilWaitFor(npmInstall, path.resolve(process.cwd(), appLocalPath));
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

exports.syncDeps = function * (config, appModuleStore, appContainer)
{
	// Check to see if there are any dependencies in appDefinition
	//
	var appDefinition = yield appModuleStore.getAppDefinitionAwaitable();
	if (appDefinition["dependencies"] && (Object.keys(appDefinition["dependencies"]).length > 0))
	{
		var appLocalPath = path.resolve(config.get('APP_ROOT_PATH'), appContainer);

		console.log("Updating package.json from remote store");
		mkdirSync(appLocalPath); // Create local path if it doesn't exist...
		var packageData = yield appModuleStore.getModuleSourceAwaitable("package.json");
		yield utilWaitFor(fs.writeFile, path.resolve(appLocalPath, "package.json"), packageData);

		// Do npm install in <container>
		//
		console.log("Installing app dependencies locally...");
		yield utilWaitFor(npmInstall, appLocalPath);
		return true;
	}

	return false;
}

// This emulates the Fibers wait.for function (as a generator)
//
function * utilWaitFor (fn)
{
    var args = lodash.slice(arguments, 1); // Remove fn
    var result = yield function (done) 
    { 
        args.push(done); // Append the callback
        fn.apply(this, args);
    }
    return result;
}

exports.waitFor = utilWaitFor;

// Since we did a lot of wait.for on "read" under fibers, and since read returns two values (result and isDefault) which get passed
// back in an array under co, we use this helper to streamline the calls to read (and just return the result).
//
function * utilRead (params)
{
    var result = yield function(done)
    {
        read(params, done);
    }
    return result[0]; // Read returns result, isDefault
}

exports.read = utilRead;
