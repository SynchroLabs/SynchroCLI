#!/usr/bin/env node

var pkg = require('../package.json');

var commander = require('commander');
commander.version(pkg.version);
commander.command('init', 'initialize Synchro in the current directory');
commander.command('update', 'updates version of Synchro in the current directory');
commander.command('ls <app>', 'list Synchro apps installed in the current directory');
commander.command('new <appContainer> <appPath> <appDescription>', 'create a new Synchro app and add it to the current configuration');
commander.command('add <appContainer> <appPath>', 'add an existing Synchro app to the current configuration');
commander.command('remove <appPath>', 'remove a Synchro app from the current configuration');
commander.command('delete <appContainer>', 'remove a Synchro app from the current configuration and delete its contents');
commander.command('install <appReference> <appContainer> <appPath>', 'install a remote Synchro app into the current configuration');
commander.command('syncdeps <appContainer>', 'ensure that dependencies of a Synchro app are installed on local server');
commander.command('userpass <username> <password>', 'set (or clear) Synchro Studio username/password');
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
