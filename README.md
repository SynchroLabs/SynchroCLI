# synchro -- Synchro Command Line Interface

`synchro` is a command-line tool for installing and managing your Synchro Node servers and applications.

## Install

    npm install synchro -g

## Documentation

Use the `--help` command to get basic comand help:

    synchro --help

## Authentication

After installing the command line interface, you need to authenticate to the Synchro server so that you can download the required packages.  Go to synchro.io/signup to create an account.  Then run:

	synchro auth

When prompted, supply the email address and password that you used to set up your account on the Synchro.io web site.  You will only have to do this once per machine.

## Creating a Synchro server on your machine

After authenticating, create a new directory and switch to it, then run:

    synchro init

This will install the Synchro server application and use npm to install all required packages.  After that you can start the server by doing:

    node app.js

Or if you prefer:

    npm start
