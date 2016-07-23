#!/usr/bin/env node

var co = require('co');
var fs = require('fs');
var util = require('./util');

var path = require('path');
var tarStream = require('tar-stream');
var zlib = require('zlib');
var isGzip = require('is-gzip');
var isTar = require('is-tar');
var jszip = require('jszip');
var lodash = require('lodash');

var commander = require('commander');
var command = new commander.Command("synchro install");
command.usage('[options] <appReference> <appContainer> <appPath>');
command.description('Retreive a remote Synchro application and install it in the current configuration and module store');
command.option('-u, --update', 'Update an existing app installed in the store');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    For new installs:');
    console.log('');
    console.log('      The <appReference> may be a file path or an http/https URL, and in either case, should point to a file');
    console.log('      that was created by running "npm pack" on a Synchro app.');
    console.log('');
    console.log('      If no <appContainer> is specified, install will attempt to install the application using the "name" field');
    console.log('      from the package.json of the app being installed as the container name.');
    console.log('');
    console.log('      If no <appPath> is specified, it will take on the value of <appContainer> (whether that was provided');
    console.log('      explicitly or derived from the app being installed).');
    console.log('');
    console.log('    For updates:');
    console.log('');
    console.log('      When the -u / --update option is specified, the first and only parameter should be the <appContainer>');
    console.log('      of an app that was previously installed from a URL.  If the <appContainer> is not provided, you will be');
    console.log('      prompted for it.  The container will be updated to reflect the current contents of the archive available');
    console.log('      at that URL, and any dependencies will be updated.');
});
command.parse(process.argv);

// When an application is installed from a http/https URL, that URL is recorded in the package.json file of the installed
// application under the key: synchroArchiveUrl.  That application can then be updated by providing just the name of the store
// container.  When updated, the existing version of the app will be removed and the new one will be installed, whether or not
// the new one is a more recent version.
//
// !!! We could compare the package.json version from the downloaded archive to the currently installed app before we overwrite
//     it if we wanted to allow for conditional overwrite (only when newer version available).
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
				co(function * ()
				{
					yield appModuleStore.putModuleSourceAwaitable(filepath, contents);
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

co(function * ()
{
	var config = util.getConfigOrExit(command.config);
	var modulesStore = util.getModulesStore(config);
	var appsConfig = yield util.getAppsConfig(config, modulesStore);

	var appReference;
	var appContainer;
	var appPath;
	var isUpdate = false; 

	if (command.update)
	{
		isUpdate = true;

		if (command.args.length > 0)
		{
		    appContainer = command.args[0];
		}
		else
		{
			appContainer = yield util.read({prompt: "App container: "});
			if (!appContainer || (appContainer.length == 0))
			{
				console.log("Synchro container name cannot be empty");
				process.exit(1);
			}
		}

		if (yield util.containerExists(modulesStore, appContainer))
		{
			// Get the app definition (package.json) and grab the URL
			var appModuleStore = yield modulesStore.getAppModuleStoreAwaitable(appContainer);
			var appDefinition = yield appModuleStore.getAppDefinitionAwaitable();
			if (appDefinition.synchroArchiveUrl)
			{
				appReference = appDefinition.synchroArchiveUrl;
			}
			else
			{
				console.log("Synchro app container '%s' was not installed from a remote URL (it does not have a synchroArchiveUrl element), so it cannot be updated", appContainer);
				process.exit(1);
			}
		}
		else
		{
			console.log("Synchro app container '%s' does not exists in the active module store", appContainer);
			process.exit(1);
		}

		// console.log("Update preconditions met, container '%s', url: %s", appContainer, appReference);
	}
	else
	{
		if (command.args.length > 0)
		{
		    appReference = command.args[0];
		}

		if (command.args.length > 1)
		{
			appContainer = command.args[1];
			if (command.args.length > 2)
			{
				appPath = command.args[2];
			}
			else
			{
				appPath = appContainer;
			}
		}

		if (!appReference)
		{
			// Prompting for all...
			//
			appReference = yield util.read( {prompt: "App reference (file or URL): "});
			appContainer = yield util.read({prompt: "App container: "});
			if (!appContainer || (appContainer.length == 0))
			{
				console.log("Synchro container name cannot be empty");
				process.exit(1);
			}

			appPath = yield util.read({prompt: "App path: ", default: appContainer });
		}		
	}

	var url = null;
	var fileContents;

	if (/^https?:.*/.test(appReference))
	{
		url = appReference;
		console.log("Downloading package from URL:", url);
		fileContents = yield util.waitFor(util.getUrl, url);
	}
	else
	{
		fileContents = yield util.waitFor(fs.readFile, appReference);
	}

	if (isUpdate)
	{
		console.log("Updating app in container: '%s'", appContainer);
	}
	else
	{
		console.log("Installing app from reference: %s", appReference);
	}

	if (path.extname(appReference) == ".zip")
	{
		console.log("Processing archive (pkzip)");

		var zip = new jszip(fileContents);

		var firstFileName = Object.keys(zip.files)[0];
		var prefix = firstFileName.substring(0, firstFileName.search(/[\/\\]/) + 1);
		if (prefix && (prefix.length > 0))
		{
			for (var key in zip.files) 
			{
				if (!key.startsWith(prefix))
				{
					prefix = "";
					break;
				}
			}
		}

		var packageJsonFile = zip.files[prefix + "package.json"];
		if (packageJsonFile)
		{
			var packageJson;
			var packageJsonErr;
			try 
			{ 
				packageJson = JSON.parse(packageJsonFile.asText()); 
			} 
			catch (e) 
			{
				packageJsonErr = e;
			}

			if (packageJson)
			{
				console.log("Package.json: " + JSON.stringify(packageJson, null, 4));
				if (packageJson.engines && packageJson.engines.synchro)
				{
					if (isUpdate)
					{
						yield modulesStore.deleteAppContainerAwaitable(appContainer);
					}
					else if (appContainer)
					{
						// App container provided on command line and appPath either provided or computed...
						//
						if (appsConfig.isAppInstalled(appPath))
						{
							console.log("Synchro app already installed at path '%s' in the active configuration", appPath);
							process.exit(1);
						}
						else if (yield util.containerExists(modulesStore, appContainer))
						{
							console.log("Synchro app container '%s' already exists in the active module store", appContainer);
							process.exit(1);
						}
					} 
					else
					{
						// No app name provided on the command line, let's fall back to package "name"...
						//
					    appContainer = packageJson.name;
					    appPath = appContainer;
						if (appsConfig.isAppInstalled(appPath))
						{
							console.log("Synchro app already installed at path '%s' in the active configuration", appPath);
							console.log("Try specifying another name on the command line");
							process.exit(1);
						}
						else if (yield util.containerExists(modulesStore, appContainer))
						{
							console.log("Synchro app container '%s' already exists in the active module store", appContainer);
							console.log("Try specifying another name on the command line");
							process.exit(1);
						}

					}

					yield modulesStore.createAppContainerAwaitable(appContainer);
					var appModuleStore = yield modulesStore.getAppModuleStoreAwaitable(appContainer);

					// Extract the files...
					//
					for (var key in zip.files) 
					{
						var file = zip.files[key];
						if (!file.dir)
						{
							var storeName = key.substring(prefix.length); // Remove prefix, if any...
							var contents = Buffer(file.asUint8Array());
							console.log("Writing file '%s' (%d bytes) to module store", storeName, contents.length);
							yield appModuleStore.putModuleSourceAwaitable(storeName, contents);
						}
					}

					// Update the package.json with the url (if not already set)
					//
					if (url && (url != packageJson.synchroArchiveUrl))
					{
						console.log("Updating synchroArchiveUrl in package.json to:", url);
						packageJson.synchroArchiveUrl = url;
						yield appModuleStore.putModuleSourceAwaitable("package.json", JSON.stringify(packageJson, null, 2));						
					}

					if (!isUpdate)
					{
						// Add the app to the current config...
						//
						var apps = config.get("APPS") || {};
						appsConfig.APPS[appPath] = { container: appContainer };
						yield appsConfig.save();
					}

					if (config.get('MODULESTORE_SERVICE') != 'FileModuleStore') // Maybe not the best test for this...
					{
						// If we are installing the app to a module store other than the local file store, we need
						// to run the syncdeps logic here (to make sure any dependencies are available locally).
						//
						if (yield util.syncDeps(config, appModuleStore, appContainer))
						{
							console.log("Synchro app in container '%s' dependencies updated", appContainer);
						}
					}
					else
					{
						// If we are installig the app to the local file store, we npm install any app dependencies.
						//
						console.log("Synchro app in container '%s' dependency installation via npm install...", appContainer);
						yield util.installAppDependencies(config, appContainer);
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
				// Parse failure on package.json
				//
				console.log("Error: Unable to parse package.json found in archive: ", packageJsonErr);
			}
		}
		else
		{
			// Not a node module (no package.json)
			//
			console.log("Error: Archive did not contain a Synchro app (no package.json found)");
		}
	}
	else if (isGzip(fileContents))
	{
		console.log("Processing archive (tarball)");

		var unzipped = yield util.waitFor(zlib.unzip, fileContents);
		if (isTar(unzipped))
		{
			var packageJson = yield util.waitFor(getPackageJsonFromTarAsync, unzipped);
			if (packageJson)
			{
				console.log("Package.json: " + JSON.stringify(packageJson, null, 4));
				if (packageJson.engines && packageJson.engines.synchro)
				{
					if (isUpdate)
					{
						yield modulesStore.deleteAppContainerAwaitable(appContainer);
					}
					else if (appContainer)
					{
						// App container provided on command line and appPath either provided or computed...
						//
						if (appsConfig.isAppInstalled(appPath))
						{
							console.log("Synchro app already installed at path '%s' in the active configuration", appPath);
							process.exit(1);
						}
						else if (yield util.containerExists(modulesStore, appContainer))
						{
							console.log("Synchro app container '%s' already exists in the active module store", appContainer);
							process.exit(1);
						}
					} 
					else
					{
						// No app name provided on the command line, let's fall back to package "name"...
						//
					    appContainer = packageJson.name;
					    appPath = appContainer;
						if (appsConfig.isAppInstalled(appPath))
						{
							console.log("Synchro app already installed at path '%s' in the active configuration", appPath);
							console.log("Try specifying another name on the command line");
							process.exit(1);
						}
						else if (yield util.containerExists(modulesStore, appContainer))
						{
							console.log("Synchro app container '%s' already exists in the active module store", appContainer);
							console.log("Try specifying another name on the command line");
							process.exit(1);
						}
					}

					yield modulesStore.createAppContainerAwaitable(appContainer);
					var appModuleStore = yield modulesStore.getAppModuleStoreAwaitable(appContainer);

					// Extract the files...
					//
					yield util.waitFor(extractModuleFilesToAppModuleStoreAsync, appModuleStore, unzipped);

					// Update the package.json with the url (if not already set)
					//
					if (url && (url != packageJson.synchroArchiveUrl))
					{
						console.log("Updating synchroArchiveUrl in package.json to:", url);
						packageJson.synchroArchiveUrl = url;
						yield appModuleStore.putModuleSourceAwaitable("package.json", JSON.stringify(packageJson, null, 2));						
					}

					if (!isUpdate)
					{
						// Add the app to the current config...
						//
						appsConfig.APPS[appPath] = { container: appContainer };
						yield appsConfig.save();
					}

					if (config.get('MODULESTORE_SERVICE') != 'FileModuleStore') // Maybe not the best test for this...
					{
						// If we are installing the app to a module store other than the local file store, we need
						// to run the syncdeps logic here (to make sure any dependencies are available locally).
						//
						if (yield util.syncDeps(config, appModuleStore, appContainer))
						{
							console.log("Synchro app in container '%s' dependencies updated", appContainer);
						}
					}
					else
					{
						// If we are installig the app to the local file store, we npm install any app dependencies.
						//
						console.log("Synchro app in container '%s' dependency installation via npm install...", appContainer);
						yield util.installAppDependencies(config, appContainer);
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
		// Not a zip or tarball
		//
		console.log("Error: File was not a compressed archive");
	}

}).catch(function(err){ console.log(err) });
