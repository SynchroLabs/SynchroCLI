#!/usr/bin/env node

var co = require('co');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro ls");
command.usage('[options] <app>')
command.description('List installed apps');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.option('-d, --details', 'Display details from package.json for each app');
command.option('-s, --store', 'Display list of app containers in current module store');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <app> is provided, it is a regex used to filter the apps to be listed.');
    console.log('');
});
command.parse(process.argv);

// <appPath> can be a regex used to filter apps for listing, and may need to be quoted depending on how
// the OS handles command lines (for example, in Windows, ^ is special char and won't make it to this
// command unless in a quoted string)
//

co(function * ()
{
	var config = util.getConfigOrExit(command.config);
	var modulesStore = util.getModulesStore(config);
	var appsConfig = yield util.getAppsConfig(config, modulesStore);

	// appPath will be treated as a filter on either appPath or appContainer, depending on whether -s was specified
	//
	var appPath = command.args[0];

	function * dumpDetails (container)
	{
		var appModuleStore = yield modulesStore.getAppModuleStoreAwaitable(container);

		var appDefinition = yield appModuleStore.getAppDefinitionAwaitable();
		console.log("  App definition from store:");
		var indent = "  ";
		var defString = JSON.stringify(appDefinition, null, 2);
		console.log(indent + "%s", defString.split(/\n/).join("\n" + indent));

		var modules = yield appModuleStore.listModulesAwaitable();
		if (modules.length > 0)
		{
			console.log("  Modules:");
			for (var i = 0; i < modules.length; i++)
			{
				console.log("    %s", modules[i]);
			}
		}
		else
		{
			console.log("  No modules found");
		}
	}

	function * dumpApp(appPath, appContent, showDetails)
	{
		// App content: { "container": "foo" }
		//
		if (appPath != appContent.container)
		{
			console.log("Application: %s [container: %s]", appPath, appContent.container);
		}
		else
		{
			console.log("Application: %s", appPath);
		}

		if (showDetails)
		{
			yield dumpDetails(appContent.container);
		}
	}

	function * dumpContainer(container, showDetails)
	{
		var appPath = appsConfig.installedAppPathsFromContainer(container);
		if (appPath == container)
		{
			console.log("Container: %s [installed]", container);
		}
		else if (appPath)
		{
			console.log("Container: %s [installed as %s]", container, appPath);
		}
		else
		{
			console.log("Container: %s", container);
		}

		if (showDetails)
		{
			yield dumpDetails(container);
		}
	}

	if (command.store)
	{
		var appContainers = yield modulesStore.getAppContainersAwaitable() || [];
		if (appContainers.length > 0)
		{
			for (var i = 0; i < appContainers.length; i++) 
			{
				if (!appPath || appContainers[i].match(appPath))
				{
					if (command.details)
					{
						// Separator (between apps) for detailed output
						console.log();
					}
					yield dumpContainer(appContainers[i], command.details);
				}
			}
		}
		else
		{
			console.log("No Synchro app containers in current module store");
		}
	}
	else
	{
		var apps = appsConfig.APPS;
	    if (Object.keys(apps).length > 0)
	    {
	    	for (var app in apps) 
	    	{
				if (!appPath || app.uriPath.match(appPath))
				{
					if (command.details)
					{
						// Separator (between apps) for detailed output
						console.log();
					}
					yield dumpApp(app, apps[app], command.details);
				}
			}
	    }
		else
		{
			console.log("No Synchro apps installed in this directory");
		}
	}
	
}).catch(function(err){ console.log(err) });
