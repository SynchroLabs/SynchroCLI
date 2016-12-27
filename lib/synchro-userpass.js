#!/usr/bin/env node

var co = require('co');
var util = require('./util');

var commander = require('commander');
var command = new commander.Command("synchro setpass");
command.usage('[options] <username> <password>');
command.description('Sets/clears a username/password combination in the current configuration');
command.option('-c, --config <value>', 'Use the specified configuration file');
command.option('-d, --delete', 'Delete the user');
command.on('--help', function()
{
    console.log('  Details:');
    console.log('');
    console.log('    Username and hash of password are written under STUDIO_USERS in current configuration.');
    console.log('    These username and hash values are used for authentication by Synchro Studio, when enabled.');
    console.log('');
    console.log('    If username is not provided on command line, you will be prompted to enter a username, password,');
    console.log('    and password verification.  If username is provided on command line, but password is not, the ');
    console.log('    user will be removed from the current configuration.  If username and password are entered');
    console.log('    interactively and password is set to empty, the user will be removed from the current configuration.');
    console.log('');
});
command.parse(process.argv);

co(function * ()
{
	var config = util.getConfigOrExit(command.config);

	var userName;
	if (command.args.length > 0)
	{
	    userName = command.args[0];
	}
	if (!userName)
	{
		userName = yield util.read( {prompt: "User name: "});
	}

	var userPass;
	if (!command.delete)
	{
		if (command.args.length > 1)
		{
		    userPass = command.args[1];
		}
		if (!userPass)
		{
			userPass = yield util.read( {prompt: "Password: ", silent: true, replace: "*"});
			var userPass2 = yield util.read( {prompt: "Verify password: ", silent: true, replace: "*"});

			if (userPass != userPass2)
			{
				console.log("Error: Password and verification did not match");
				process.exit(1);
			}
		}		
	}

	if (!userName)
	{
		console.log("No user name provided, exiting");
		process.exit(1);
	}
	else 
	{
		var users = config.get("STUDIO_USERS") || {};
		if (userPass)
		{
			// Set (add or update) user pass
			//
			var hash = config.hashPassword(userPass);

			if (users[userName])
			{
				users[userName] = hash;
				console.log("Updated password for user: '%s'", userName);
			}
			else
			{
				users[userName] = hash;
				console.log("Added new user: '%s' and set password", userName);				
			}
			config.set("STUDIO_USERS", users);
		}
		else
		{
			if (users[userName])
			{
				delete users[userName];
				console.log("Deleted user: '%s'", userName);
				config.set("STUDIO_USERS", users);
			}
			else
			{
				console.log("Error: Unable to delete user: '%s' - user did not exist", userName);
			}
		}
	}

	config.save();

}).catch(function(err)
{ 
	console.log(err);
	process.exit(1);
});
