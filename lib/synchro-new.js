#!/usr/bin/env node

var co = require('co');
var fs = require('fs');
var path = require('path');

var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro new");
command.usage('[options] <appContainer> <appPath> <appDescription>');
command.description('Create a new application in the module store and add it to the current configuration.');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    If <appContainer> is not provided on the command line, you will be prompted for it.');
    console.log('    If <appPath> is not provided on the command line, the value of <appContainer> will be used.');
    console.log('');
    console.log('    Note: As the appDescription will typically contain spaces, it should be quoted if passed on the command line.');
    console.log('');
});
command.parse(process.argv);

// For "new", we assume the appPath and appContainer will be the same.  It's tempting to allow them to be specified independently,
// but that creates a lot of complexity and it's not clear there's really a use case for that in the case of a "new" Synchro app.
//

co(function * ()
{
	var config = util.getConfigOrExit(command.config);

	var appContainer;
	var appPath;

    if (command.args.length >= 2)
    {
        // Two params: container, path
        //
        appContainer = command.args[0];
        appPath = command.args[1];
    }
    else if (command.args.length == 1)
    {
        // One param: container (path is also container)
        //
        appContainer = command.args[0];
        appPath = appContainer;
    }
    else
    {
        // No params: prompt for appContainer and appPath (appPath defaults to appContainer)
        //
        appContainer = yield util.read({prompt: "App container: "});
        if (!appContainer || (appContainer.length == 0))
        {
            console.log("Synchro container name cannot be empty");
            process.exit(1);
        }

        appPath = yield util.read({prompt: "App path: ", default: appContainer });
    }

	if (command.args.length >= 3)
	{
	    appDescription = command.args[2];
	}
    else
	{
        appDescription = yield util.read({prompt: "App description: "});
	}

    if (!util.validateAppPath(appContainer))
	{
		console.log("Synchro app container name can only contain lower case letters, numbers, and dash characters");
		process.exit(1);
	}

    if (!util.validateAppPath(appPath))
    {
        console.log("Synchro app path can only contain lower case letters, numbers, and dash characters");
        process.exit(1);
    }

	if (util.isAppInstalled(config, appPath))
	{
        console.log("Synchro app at path '%s' already installed in the active configuration", appPath);
        process.exit(1);
	}

	// We use the config object to create the module store, then create the new app in the module store
	// using appropriate module store methods (so this should work with any module store provider).
	//     
	var modulesStore = util.getModulesStore(config);

	try
	{
        // This will error if the container already exsists...
        //
		yield modulesStore.createAppContainerAwaitable(appContainer);
	}
	catch (err)
	{
		console.log("Error:", err.message);
		process.exit(1);
	}

	var appModuleStore = yield modulesStore.getAppModuleStoreAwaitable(appContainer);

	var srcPath = path.resolve(__dirname, "../app-template");
    var files = yield util.waitFor(fs.readdir, srcPath);
    for (var i = 0; i < files.length; i++) 
    {
    	var fileName = files[i];
        var filePath = path.resolve(srcPath, fileName);
        if (fs.statSync(filePath).isFile())
        {
        	console.log("Processing file:", fileName);
        	var content = yield util.waitFor(fs.readFile, filePath, { encoding: "utf8" });

    		content = content.replace("{{{name}}}", appPath);
    		content = content.replace("{{{description}}}", appDescription);

        	yield appModuleStore.putModuleSourceAwaitable(fileName, content);
        }
    }

	var apps = config.get("APPS") || {};
    apps[appPath] = { container: appContainer };
	config.set("APPS", apps);
	config.save();

	console.log("Synchro application '%s' created", appPath);

}).catch(function(err){ console.log(err) });
