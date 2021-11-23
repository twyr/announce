#!/usr/bin/env node
/**
 * @name		announce.js
 * @file		Main entry point of the Twy'r Announce CLI tool
 * @version		0.11.1
 *
 * @author		Vish Desai <shadyvd@hotmail.com>
 * @copyright	(c) {@link https://twyr.github.io/annouce|Twy'r Announce} 2016-2021
 *
 * @license		MITNFA
 */

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
	const explorer = cosmiconfigSync?.('announce', {
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

	const configuration = explorer?.search?.();

	// Step 1: Crawl the commands folder and get the list of available commands
	const { 'fdir': FDir } = require('fdir');
	const { join } = require('path');

	const crawler = new FDir()
		?.withFullPaths?.()
		?.withErrors?.()
		?.glob?.('./**/*-command.js');

	const commandDefinitionFolder = join?.(__dirname, './../commands');
	const availableCommandDefinitionFiles = crawler?.crawl?.(commandDefinitionFolder)?.sync?.();

	// Step 2: Setup the commander cli
	const { program } = require('commander');

	program?.version?.(pkg?.version, '-v, --version', 'output the current version');

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
		console?.log?.(`twyr/announce@${program?._version}`);
		await program?.parseAsync?.(process?.argv);
	}
	catch(err) {
		console.error(`${err.message}\n${err.stack}$`);
	}
}());
