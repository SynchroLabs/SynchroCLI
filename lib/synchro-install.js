#!/usr/bin/env node

var wait = require('wait.for');
var fs = require('fs');
var request = require('request');
var read = require("read");
var util = require('./util');

var tarStream = require('tar-stream');
var zlib = require('zlib');
var isGzip = require('is-gzip');
var isTar = require('is-tar');

var commander = require('commander');
var command = new commander.Command("synchro install");
command.usage('[options] <appReference> <appName>');
command.description('Retreive a remote Synchro application and install it in the current configuration and module store');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    The appReference may be a file path or an http/https URL, and in either case, should point to a file');
    console.log('    that was created by running "npm pack" on a Synchro app.');
    console.log('');
    console.log('    If no appName is specified, install will attempt to install the application using the "name" field');
    console.log('    from the package.json of the app being installed.');
    console.log('');
});command.parse(process.argv);

//
// !!! TODO: The location from which the app was installed should be recorded in the package.json file of the newly 
//     installed app under the key "url", in part so that it can be updated later by using that location reference.
//     This only applies for apps installed from URLs.  Apps installed from local files should probably not overwrite
//     (or add) the "url" in package.json (?).
//
// !!! -u, --update option to get new contents of app, if any, and update local copy as appropriate.  Not sure
//     how this works if the apps are tarballed (ideally we'd like to use something like semantic versioning
//     maybe, maybe looking in the remote package.json, etc).  Or maybe we just don't do this and if you want to
//     update, your just run install again (and maybe we see that the app already exists, and prompt to overwrite, 
//     and/or we look for an "overwrite" flag).
//

function getPackageJsonFromTarAsync(contents, callback)
{
	var extract = tarStream.extract();

	extract.on('entry', function(header, stream, done) 
	{
		if (header.name == "package/package.json")
		{
			var chunk = [];
			var len = 0;

			stream.on('data', function(data) 
			{
				chunk.push(data);
				len += data.length;
			});

			stream.on('end', function() 
			{
				var	contents = Buffer.concat(chunk, len);
				callback(null, JSON.parse(contents));
				extract.destroy();
				done();
			});			
		}
		else
		{
			done();
		}
	});

	extract.on('finish', callback); // Won't get here if we destroy() upon finding package.json, above.
	extract.on('error', callback);

	extract.end(contents);
}

function extractModuleFilesToAppModuleStoreAsync(appModuleStore, contents, callback)
{
	var extract = tarStream.extract();

	extract.on('entry', function(header, stream, done) 
	{
		var chunk = [];
		var len = 0;

		stream.on('data', function(data) 
		{
			chunk.push(data);
			len += data.length;
		});

		stream.on('end', function() 
		{
			if ((header.type !== 'directory') && (header.name.indexOf("package/") == 0)) 
			{
				var filepath = header.name.substring("package/".length);
				var	contents = Buffer.concat(chunk, len);
				console.log("Writing file '%s' (%d bytes) to module store", filepath, contents.length);
				wait.launchFiber(function()
				{
					appModuleStore.putModuleSource(filepath, contents);
					done();
				});
			}
			else
			{
				done();
			}
		});
	});

	extract.on('finish', callback);
	extract.on('error', callback);

	extract.end(contents);
}

wait.launchFiber(function()
{
	var config = util.getConfigOrExit(command.config);
	var modulesStore = util.getModulesStore(config);

	var appReference;
	var appName; 

	if (command.args.length > 0)
	{
	    appReference = command.args[0];
	}

	if (command.args.length > 1)
	{
		appName = command.args[1];
	}

	if (!appReference)
	{
		appReference = wait.for(read, {prompt: "App reference (file or URL): "});
		appName = wait.for(read, {prompt: "App name: "});
	}

	var fileContents;

	if (/^https?:.*/.test(appReference))
	{
		console.log("Downloading package from URL:", appReference);
		fileContents = wait.for(util.getUrl, appReference);
	}
	else
	{
		fileContents = wait.for(fs.readFile, appReference);
	}

	if (isGzip(fileContents))
	{
		var unzipped = wait.for(zlib.unzip, fileContents);
		if (isTar(unzipped))
		{
			var packageJson = wait.for(getPackageJsonFromTarAsync, unzipped);
			if (packageJson)
			{
				console.log("Package.json: " + JSON.stringify(packageJson, null, 4));
				if (packageJson.engines && packageJson.engines.synchro)
				{
					if (appName)
					{
						// App name provided on command line...
						//
						if (util.isAppInstalled(config, appName))
						{
							console.log("Synchro app named '%s' already installed in the active configuration", appName);
							process.exit(1);
						}
						else if (util.containerExists(modulesStore, appName))
						{
							console.log("Synchro app named '%s' already exists in the active module store", appName);
							process.exit(1);
						}
					} 
					else
					{
						// No app name provided on the command line, let's fall back to package "name"...
						//
					    appName = packageJson.name;
						if (util.isAppInstalled(config, appName))
						{
							console.log("Synchro app named '%s' already installed in the active configuration", appName);
							console.log("Try specifying another name on the command line");
							process.exit(1);
						}
						else if (util.containerExists(modulesStore, appName))
						{
							console.log("Synchro app named '%s' already exists in the active module store", appName);
							console.log("Try specifying another name on the command line");
							process.exit(1);
						}
					}

					try
					{
						modulesStore.createAppContainer(appName);
					}
					catch (err)
					{
						console.log("Error:", err.message);
						process.exit(1);
					}

					var appModuleStore = modulesStore.getAppModuleStore(appName);
					wait.for(extractModuleFilesToAppModuleStoreAsync, appModuleStore, unzipped);

					// Add the app to the current config...
					//
					var apps = config.get("SYNCHRO_APPS") || [];
					apps.push({ uriPath: appName, container: appName});
					config.set("SYNCHRO_APPS", apps);
					config.save();

					// If we are installing the app to a module store other than the local file store, we need
					// to run the syncdeps logic here (to make sure any dependencies are available locally).
					//
				    if (config.get('MODULESTORE_SERVICE') != 'FileModuleStore')
				    {
						if (util.syncDeps(config, appModuleStore, appName))
						{
							console.log("Synchro app '%s' dependencies updated", appName);
						}
					}
				}
				else
				{
					// Not a Synchro app (no engines.synchro in package.json)
					//
					console.log("Error: Archive did not contain a Synchro app (package.json didn't specify Synchro)");
				}
			}
			else
			{
				// Not a node module (no package.json)
				//
				console.log("Error: Archive did not contain a Synchro app (no package.json found)");
			}
		}
		else
		{
			// Not a tar archive inside the gzip
			//
			console.log("Error: File did not contain a package archive");
		}
	}
	else
	{
		// Not a gzip file
		//
		console.log("Error: File was not a compressed archive");
	}
});
