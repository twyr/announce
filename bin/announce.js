#!/usr/bin/env node

'use strict';

/**
 * Module dependencies, required for ALL Twy'r modules
 * @ignore
 */

/**
 * Module dependencies, required for this module
 * @ignore
 */

(async function announceSetup() {
	// Sanity check for node versions
	const pkg = require('./../package.json');
	require('please-upgrade-node')(
		Object.assign({}, pkg, {
			'engines': {
				// eslint-disable-next-line no-inline-comments
				'node': '>=14.0' // First version with optional chaining and nullish coalescing
			}
		})
	);

	// Step 0: Load the configuration
	const { cosmiconfigSync } = require('cosmiconfig');
	const explorer = cosmiconfigSync('announce', {
		'searchPlaces': [
			'package.json',
			'.announcerc',
			'.announcerc.json',
			'.announcerc.yaml',
			'.announcerc.yml',
			'.announcerc.js',
			'announce.config.js'
		]
	});

	const configuration = explorer.search();

	// Step 1: Crawl the commands folder and get the list of available commands
	const { 'fdir': FDir } = require('fdir');
	const { join } = require('path');

	const crawler = new FDir()
		.withFullPaths()
		.withErrors()
		.glob('./**/*-command.js');

	const commandDefinitionFolder = join(__dirname, './../commands');
	const availableCommandDefinitionFiles = crawler.crawl(commandDefinitionFolder).sync();

	// Step 2: Setup the commander cli
	const { program } = require('commander');

	program
		.version(pkg.version, '-v, --version', 'output the current version')
		.option('-d, --debug', 'print additional debug information', false)
		.option('-s, --silent', `disable announce's console output`, false)
		.option('-q, --quiet', `minimize announce's console output to only important messages`, false);

	// Step 3: Setup each command in commander
	for(const commandDefinitionFile of availableCommandDefinitionFiles) {
		// eslint-disable-next-line
		const { commandCreator } = require(commandDefinitionFile);
		commandCreator?.(program, configuration?.config);
	}

	// Finally: Parse arguments, execute the command, etc. - basically, do the job requested
	// eslint-disable-next-line security-node/detect-crlf
	try {
		// eslint-disable-next-line security-node/detect-crlf
		console.log(`twyr/announce@${program._version}`);
		await program.parseAsync(process.argv);
	}
	catch(err) {
		console.error(`${err.message}\n${err.stack}$`);
	}
}());
