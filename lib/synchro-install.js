#!/usr/bin/env node

var wait = require('wait.for');
var request = require('request');
var read = require("read");
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro install");
command.usage('[options] <app>');
command.description('Retreive a remote Synchro application and install it in the current configuration and module store');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    Not implemented yet.');
    console.log('');
});command.parse(process.argv);

// !!! The "install" command will copy an app from another location and install it in the current
//     configuration.
//
//     The location may be a URI that points to tarball (created by doing "npm pack" on a Synchro app).
//
//     (Future) It may be a short name reference to an app hosted in a synchro.io repository of apps (sample and/or demo apps).
//
//     A new container will be created.  The app to be installed will be copied from the remote location and
//     placed in the new container (expanding any archives, as appropriate).  Then the app will be installed
//     in the local configuration.  
//
//     The location from which the app was installed will be recorded in the package.json file of the newly 
//     installed app under the key "url", in part so that it can be updated later by using that location reference.
//
//     After install, any dependencies specified in package.json should be installed (sharing implementation of
//     this functionality with the syncdeps command).
//
//     -u, --update option to get new contents of app, if any, and update local copy as appropriate.  Not sure
//     how this works if the apps are tarballed (ideally we'd like to use something like semantic versioning
//     maybe, maybe looking in the remote package.json, etc).  Or maybe we just don't do this and if you want to
//     update, your just run install again (and maybe we see that the app already exists, and prompt to overwrite).
//
//     Allow specification of local appName (uri and container) - may default to app name from package.json of app
//     being installed, but that may be in use.
//


// !!! tgz archive handling:
//
// For tgz files (as produced by "npm pack"), the unzipping would be done via the zlib package included with Node.js,
// and the unpacking of the archive would be done by the tar-stream package (or something that uses it).  There are 
// popular packages called "is-tar" and "is-gzip" to determine if a buffer or byte array represents tar/gzip data.
//
// Here is an example of unzipping, and piping the decompressed content to the tar-stream unpack:
//
//    https://github.com/kevva/decompress-targz/blob/master/index.js
//

function getFile(url, callback)
{
	console.log("Getting file from URL:", url);
    var options = 
    {
        url: url,
        timeout: 5000
    }

    request(options, function(err, response, body)
    {
 		console.log("Got response:", response.statusCode);
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
        	err = { code: response.statusCode, message: response.body };
        	callback(err);
        }
    });	
}


wait.launchFiber(function()
{
	var config = util.getConfigOrExit(command.config);

	var appReference;
	if (command.args.length > 0)
	{
	    appReference = command.args[0];
	}
	if (!appReference)
	{
		appReference = wait.for(read, {prompt: "App reference: "});
	}

	var file = wait.for(getFile, appReference);

	console.log("Got file:", file);

	// throw new Error("Not implemented yet");
});
