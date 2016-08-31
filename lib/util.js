#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var co = require('co');
var read = require("read");
var request = require('request');
var tarStream = require('tar-stream');
var zlib = require('zlib');
var isGzip = require('is-gzip');
var isTar = require('is-tar');
var tarFs = require('tar-fs');
var lodash = require('lodash');
var semver = require('semver');
var ua = require('universal-analytics');

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

exports.getAppsConfig = function * (config, moduleStore)
{
    var appsConfig = { 'config': config, 'moduleStore': moduleStore };

    // We're just going to look in the APPS key of the config.json store (to see if there is dictionary of apps, or a
    // string indicating a module store file to use).  We look in this store specifically so as not to pick up any
    // apps state that may have gotten into the config via environment variables.
    //
    var synchroAppsConfig;

    if (config.stores["config.json"])
    {
        // New config (v1.4.5 or later)
        var config_json = config.stores["config.json"].store;
        synchroAppsConfig = config_json['APPS'];
    }
    else
    {
        // Older config
        var config_json = config.stores["file"].store;
        synchroAppsConfig = config_json['APPS'] || {};
    }

    if (typeof synchroAppsConfig === 'object')
    {
        console.log("Apps defined in config.json");
        appsConfig.APPS = synchroAppsConfig;
    }
    else
    {
        var moduleStoreAppFile = 'apps.json';
        if (typeof synchroAppsConfig === 'string')
        {
            moduleStoreAppFile = synchroAppsConfig;
        }

        appsConfig.moduleFile = moduleStoreAppFile;

        var moduleStoreAppConfig = yield moduleStore.getStoreFileAwaitable(moduleStoreAppFile);
        if (moduleStoreAppConfig)
        {
            console.log("Loading module store APPS config from module store:", moduleStoreAppFile);
            var moduleStoreApps = JSON.parse(moduleStoreAppConfig);
            appsConfig.APPS = moduleStoreApps;
        }
        else
        {
            console.log("No apps config found in module store at:", moduleStoreAppFile);
            appsConfig.APPS = {};
        }
    }

    appsConfig.isAppInstalled = function(appPath)
    {
        return !!this.APPS[appPath];
    }

    appsConfig.installedAppsFromContainer = function(container)
    {
        var apps = this.APPS;
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

    appsConfig.installedAppPathsFromContainer = function(container)
    {
        var installedApps = this.installedAppsFromContainer(container);
        if (installedApps.length > 0)
        {
            return installedApps.join(", ");
        }

        return false;
    }

    appsConfig.save = function * ()
    {
        if (this.moduleFile)
        {
            // Write apps to module store file
            yield this.moduleStore.putStoreFileAwaitable(this.moduleFile, JSON.stringify(this['APPS'], null, 4));
        }
        else
        {
            // Write to APPS in config (config.json)
            this.config.set("APPS", this['APPS']);
            this.config.save();
        }
    }

    return appsConfig;
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

    // !!! With newver versions of Synchro Server, we could do this...
    //
	// return synchroApi.createModuleStore(config);
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
    var minVersionInstallable = "1.5.5";

    var packageName = "synchro-server";
    var packageVersion = null;

    if (command.serverVersion)
    {
        // We can only install versions that are distributed via npm.
        //
        if (semver.satisfies(command.serverVersion, "< " + minVersionInstallable))
        {
            console.log("Error: Cannot install Synchro server version prior to %s, specified version was: %s", minVersionInstallable, command.serverVersion);
            process.exit(1);
        }

        packageVersion = command.serverVersion;
    }

    var cmd = "npm pack " + packageName + (packageVersion ? "@" + packageVersion : "");
    console.log("Getting Synchro Server via command: '%s'", cmd);

    // Result of 'npm pack' is filename (if success)
    var downloadPath = yield utilWaitFor(runCommand, cmd);
    console.log("Downloaded Sychro Server to: " + downloadPath);

    // Tell Google Analytics that we're downloading...
    //
    var visitor = ua('UA-62082932-1');
    visitor.pageview('/dist/' + packageName).send();

    var fileContents = yield utilWaitFor(fs.readFile, downloadPath);

    // Delete the downloaded archive
    fs.unlinkSync(downloadPath);

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

    var child = exec('npm --only=production --loglevel=error install', options, function(err, stdout, stderr) 
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
        yield function(done){fs.writeFile(path.resolve(appLocalPath, "package.json"), packageData, done)};

		// Do npm install in <container>
		//
		console.log("Installing app dependencies locally...");
        yield function(done){npmInstall(appLocalPath, done)};

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
