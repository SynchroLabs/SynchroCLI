#!/usr/bin/env node

var wait = require('wait.for');
var read = require("read");
var util = require('./util');

// Demo of usage and an option...
//
var commander = require('commander');
var command = new commander.Command("synchro install");
command.usage('[options] <app>')
command.option('-g, --global', 'Install app globally');
command.parse(process.argv);

var pkgs = command.args;
if (!pkgs.length > 0)
{
	console.log("No app specified");
	process.exit(1);
}

console.log("Installing app: " + pkgs[0]);
if (command.global)
{
	console.log("GLOBAL");
}

wait.launchFiber(function()
{
	// Demo of reading from prompt...
	//
	try
	{		
		var username = wait.for(read, {prompt: "Username: ", default: "test-user" });
		console.log("User: ", username);
	}
	catch (err)
	{
		console.log("Errmsg: ", err.message);
		if (err.message === "canceled")
		{
			console.log("synchro install canceled")
		}
		else
		{
			console.log("Error: ", err);			
		}
	}
});
