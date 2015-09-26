# Testing source under development
To test the Synchro CLI from source, go to the source directory (the directory where the file you are reading now is located) and do:

    npm link

This will create a global synchro command and symlinks back to the implementation in the source directory.  You can now edit source in place and test that code by running `synchro` (in any directory).

# Testing a local release candidate

When you have a version you feel is ready to publish:

Update the version number in package.json

Generate a new npm-shrinkwrap.json (this will pick up the new version number, and any dependency changes):

    npm shrinkwrap

Unlink/uninstall the dev source directory package:

    npm uninstall -g synchro

Note: Just doing npm unlink will remove the npm symlink to the project, but will not remove the top level “synchro” command.

To test installing and running CLI as it will be installed when published to npmjs and installed from there, we have a couple of options.

1) Install the local code globally (this will copy the code from the local directory and install it globally).  In the source directory, do:

    npm install -g

2) Alternatively, you can create and install a package archive (this is closer to what npm publish / npm install does).  In the source directory, do:

    npm pack
    npm install -g synchro-X.X.X.tgz

The archive you make with pack, which will have been named using current version, is what you want to pass to install above.  That archive should be equivalent to what will be published to npmjs when you publish later.  You may inspect the archive if desired (to verify bundledDependencies, for example).

Once you have installed the CLI globally, you can test by running `synchro` in any directory (and of course, testing various subcommands).

# Publish a test release

When you are ready to test a published release:

Note: first delete any archive created with npm pack (above)

    npm publish --tag test
    npm uninstall -g synchro
    npm install -g synchro@test

This will publish the current version with the “dist tag” of “test”.  That allows us to test installing it using that tag to make sure it works before making it available to the public via the “latest” tag.

Perform testing of the installed test release as desired.

# Publish a public release

Once you are happy that the test release is working as desired, remove the “test" tag and promote the release to “latest", then test installing latest:

    npm dist-tag add synchro@X.X.X latest
    npm dist-tag rm synchro test
    npm uninstall -g synchro
    npm install -g synchro

Note: for the add command above, use the version number you published with the test tag earlier.

You will now have the “latest” (and now public) release installed.  

Perform any desired final testing.  

# Return to development

When you are happy with the release and want to go back to developing, remove the global package and relink your dev code (from the dev directory):

    npm remove -g synchro
    npm link