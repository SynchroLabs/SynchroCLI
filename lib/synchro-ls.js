#!/usr/bin/env node

var wait = require('wait.for');
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

// <appname> can be a regex used to filter apps for listing, and may need to be quoted depending on how
// the OS handles command lines (for example, in Windows, ^ is special char and won't make it to this
// command unless in a quoted string)
//

wait.launchFiber(function()
{
	var config = util.getConfigOrExit(command.config);
	var moduleStore = util.getModulesStore(config);

	// appName will be treated as a filter on either appPath or appContainer, depending on whether -s was specified
	//
	var appName = command.args[0];

	function dumpDetails(container)
	{
		var appModuleStore = moduleStore.getAppModuleStore(container);

		var appDefinition = appModuleStore.getAppDefinition();
		console.log("  App definition from store:");
		var indent = "  ";
		var defString = JSON.stringify(appDefinition, null, 2);
		console.log(indent + "%s", defString.split(/\n/).join("\n" + indent));

		var modules = appModuleStore.listModules();
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

	function dumpApp(uriPath, app, showDetails)
	{
		console.log("Application at path: %s, container: %s", uriPath, app.container);

		if (showDetails)
		{
			dumpDetails(app.container);
		}	
	}

	function dumpContainer(container, showDetails)
	{
		if (util.isAppInstalled(config, container))
		{
			console.log("Container: %s [installed]", container);
		}
		else
		{
			console.log("Container: %s", container);
		}

		if (showDetails)
		{
			dumpDetails(container);
		}	
	}

	if (command.store)
	{
		var appContainers = moduleStore.getAppContainers() || [];
		if (appContainers.length > 0)
		{
			for (var i = 0; i < appContainers.length; i++) 
			{
				if (!appName || appContainers[i].match(appName))
				{
					if (command.details)
					{
						// Separator (between apps) for detailed output
						console.log();
					}
					dumpContainer(appContainers[i], command.details);
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
		var apps = config.get("APPS") || {};
		var appKeys = Object.keys(apps);
		if (appKeys && (appKeys.length > 0))
		{
			appKeys.forEach(function(appKey)
			{
				if (!appName || apps[appKey].match(appName))
				{
					if (command.details)
					{
						// Separator (between apps) for detailed output
						console.log();
					}
					dumpApp(appKey, apps[appKey], command.details);
				}
			});
		}
		else
		{
			console.log("No Synchro apps installed in this directory");
		}		
	}
});
