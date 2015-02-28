#!/usr/bin/env node

var pkg = require('../package.json');

var commander = require('commander');
commander.version(pkg.version);
commander.command('auth', 'authenticate to Synchro');
commander.command('init', 'initialize Synchro in the current directory');
commander.command('ls', 'list Synchro apps installed in the current directory');
commander.command('new [appname]', 'create a new Synchro app and add it to the current configuration');
commander.command('add [appname]', 'add an existing Synchro app to the current configuration');
commander.command('remove [appname]', 'remove a Synchro app from the current configuration');
commander.command('delete [appname]', 'delete a Synchro app container an its contents, and remove it from the current configuration if present');
commander.command('install [name]', 'install one or more packages');
process.argv[1] = __filename;
commander.parse(process.argv);

// After parsing out any options, first arg must be a valid command...
//
if (!commander.args.length) 
{
    // Show help by default (if no command entered) - might be better to do a status/list
    //
    commander.commands.pop(); // Remove help command added by initial parse()
    commander.parse([process.argv[0], process.argv[1], '-h']);
    //process.exit(0);
} 
else 
{
    // Warn on invalid command
    //
    var validCommands = commander.commands.map(function(cmd)
    {
        return cmd.name();
    });

    if (validCommands.indexOf(commander.args[0]) === -1)
    {
        console.log('\n  [ERROR] - Invalid command: "%s"\n', commander.args[0]);
        commander.commands.pop(); // Remove help command added by initial parse()
	    commander.parse([process.argv[0], process.argv[1], '-h']);
    }
}
