/* eslint-disable security/detect-non-literal-fs-filename */
/* eslint-disable security/detect-non-literal-regexp */
/* eslint-disable security/detect-non-literal-require */
/* eslint-disable security-node/detect-crlf */
/* eslint-disable security-node/detect-non-literal-require-calls */
/* eslint-disable security-node/non-literal-reg-expr */
'use strict';

/**
 * Module dependencies, required for ALL Twy'r modules
 * @ignore
 */

/**
 * Module dependencies, required for this module
 * @ignore
 */
const debugLib = require('debug');
const debug = debugLib('announce:prepare');

/**
 * @class		PrepareCommandClass
 * @classdesc	The command class that handles all the prepare operations.
 *
 * @param		{object} configuration - The configuration object containing the command options from the config file (.announcerc, package.json, etc.)
 *
 * @description
 * The command class that implements the "prepare" step of the workflow.
 * Please see README.md for the details of what this step involves.
 *
 */
class PrepareCommandClass {
	// #region Constructor
	constructor(configuration) {
		Object.defineProperty(this, '_commandOptions', {
			'value': configuration ?? {}
		});
	}
	// #endregion

	// #region Public Methods
	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof PrepareCommandClass
	 * @name     execute
	 *
	 * @param    {object} options - Parsed command-line options, or options passed in via API
	 *
	 * @return {null} Nothing.
	 *
	 * @summary  The main method to prepare the codebase for the next release.
	 *
	 * This method does 2 things:
	 * - Generates the next version string based on the current one, the option passed in, and the pre-defined version ladder
	 * - Parses the source files for the current version string, and replaces it with the next one
	 *
	 */
	async execute(options) {
	//  Step 1: Setup sane defaults for the options
		const mergedOptions = this._mergeOptions(options);

		// Step 2: Set up the logger according to the options passed in
		const execMode = options?.execMode ?? 'cli';
		const logger = this._setupLogger(mergedOptions);

		// Step 3: Get the current version from package.json
		const currentVersion = this._getCurrentVersion(mergedOptions, logger);

		// Step 4: Compute the next version
		const nextVersion = this._computeNextVersion(mergedOptions, logger, currentVersion);

		// Step 5: Get a hold of all the possible files where we need to change the version string.
		const targetFiles = await this._getTargetFileList(mergedOptions, logger);

		// Step 6: Replace current version strong with next version string in all the target files
		await this._bumpVersion(mergedOptions, logger, currentVersion, nextVersion, targetFiles);

		// Finally, let the caller know...
		debug(`done bumping version from ${currentVersion} to ${nextVersion}`);
		if(execMode === 'api')
			logger?.info?.(`done bumping version from ${currentVersion} to ${nextVersion}`);
		else
			logger?.succeed?.(`Done bumping version from ${currentVersion} to ${nextVersion}`);
	}
	// #endregion

	// #region Private Methods
	/**
	 * @function
	 * @instance
	 * @memberof	PrepareCommandClass
	 * @name		_mergeOptions
	 *
	 * @param		{object} options - Parsed command-line options, or options passed in via API
	 *
	 * @return		{object} Merged options - input options > configured options.
	 *
	 * @summary  	Merges options passed in with configured ones - and puts in sane defaults if neither is available.
	 *
	 */
	_mergeOptions(options) {
		const mergedOptions = options ?? {};
		mergedOptions.execMode = this?._commandOptions?.execMode ?? 'cli';

		mergedOptions.debug = options?.debug ?? (options?.parent?.debug ?? false);
		mergedOptions.silent = options?.silent ?? (options?.parent?.silent ?? false);
		mergedOptions.quiet = options?.quiet ?? (options?.parent?.quiet ?? false);

		mergedOptions.quiet = mergedOptions.quiet || mergedOptions.silent;

		mergedOptions.series = options?.series ?? (this?._commandOptions?.series ?? 'current');
		mergedOptions.versionLadder = options?.versionLadder ?? (this?._commandOptions?.versionLadder ?? 'dev, alpha, beta, rc, patch, minor, major');
		mergedOptions.versionLadder = mergedOptions.versionLadder.split(',').map((stage) => { return stage.trim(); });

		mergedOptions.ignoreFolders = options?.ignoreFolders ?? (this?._commandOptions.ignoreFolders ?? '');
		mergedOptions.ignoreFolders = mergedOptions.ignoreFolders.split(',').map((folder) => { return folder.trim(); });

		return mergedOptions;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	PrepareCommandClass
	 * @name		_setupLogger
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 *
	 * @return		{object} Logger object with info / error functions.
	 *
	 * @summary  	Creates a logger in CLI mode or uses the passed in logger object in API mode - and returns it.
	 *
	 */
	_setupLogger(options) {
		const execMode = options?.execMode ?? 'cli';
		if(options?.debug) debugLib?.enable?.('announce:*');

		let logger = null;
		if((execMode === 'api') && !options?.silent) { // eslint-disable-line curly
			logger = options?.logger;
		}

		if((execMode === 'cli') && !options?.silent) {
			const Ora = require('ora');
			logger = new Ora({
				'discardStdin': true,
				'text': `Preparing...`
			});

			logger?.start?.();
		}

		return logger;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	PrepareCommandClass
	 * @name		_getCurrentVersion
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 *
	 * @return		{string} Current version contained in the package.json file, if present and semantically valid
	 *
	 * @summary  	Returns the version contained in the package.json file.
	 *
	 */
	_getCurrentVersion(options, logger) {
		const path = require('path');
		const semver = require('semver');

		const projectPackageJson = path.join(process.cwd(), 'package.json');
		const execMode = options?.execMode ?? 'cli';

		debug(`processing ${projectPackageJson}`);
		if(execMode === 'api')
			logger?.debug?.(`processing ${projectPackageJson}`);
		else
			logger.text = `processing ${projectPackageJson}`;

		const { version } = require(projectPackageJson);
		if(!version) {
			if(execMode === 'api')
				logger?.error?.(`${projectPackageJson} doesn't contain a version field.`);
			else
				logger?.fail?.(`${projectPackageJson} doesn't contain a version field.`);

			debug(`package.json at ${projectPackageJson} doesn't contain a version field.`);
			throw new Error(`${projectPackageJson} doesn't contain a version field.`);
		}
		if(!semver.valid(version)) {
			if(execMode === 'api')
				logger?.error?.(`${projectPackageJson} contains a non-semantic-version format: ${version}.`);
			else
				logger?.fail?.(`${projectPackageJson} contains a non-semantic-version format: ${version}.`);

			debug(`${projectPackageJson} contains a non-semantic-version format: ${version}`);
			throw new Error(`${projectPackageJson} contains a non-semantic-version format: ${version}`);
		}

		debug(`${projectPackageJson} contains version ${version}`);
		if(execMode === 'api')
			logger?.info?.(`${projectPackageJson} contains version ${version}`);
		else
			logger.text = `Preparing... current version: ${version}`;

		return version;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	PrepareCommandClass
	 * @name		_computeNextVersion
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 * @param		{string} currentVersion - Version contained in the package.json file currently
	 *
	 * @return		{string} String representing the next version
	 *
	 * @summary  	Computes the next version to be applied based on current version, the series, and the version ladder - and returns the string representation of it.
	 *
	 */
	_computeNextVersion(options, logger, currentVersion) {
		const safeJsonStringify = require('safe-json-stringify');
		const semver = require('semver');

		debug(`applying ${options.series} series to version ${currentVersion} using the ladder: ${safeJsonStringify(options.versionLadder)}`);

		const execMode = options?.execMode ?? 'cli';
		const incArgs = [currentVersion];
		const parsedVersion = semver.parse(currentVersion);

		switch (options.series) {
			case 'current':
				if(parsedVersion?.prerelease?.length) {
					incArgs.push('prerelease');
					incArgs.push(parsedVersion?.prerelease[0]);
				}
				else {
					incArgs.push('patch');
				}
				break;

			case 'next':
				if(parsedVersion?.prerelease?.length) {
					let preReleaseTag = parsedVersion?.prerelease[0];

					const currentStep = options.versionLadder.indexOf(preReleaseTag);
					if(currentStep === -1)
						preReleaseTag = 'patch';
					else if(currentStep === options.versionLadder.length - 1)
						preReleaseTag = 'patch';
					else
						preReleaseTag = options.versionLadder[currentStep + 1];

					if(preReleaseTag !== 'patch') incArgs.push('prerelease');
					incArgs.push(preReleaseTag);
				}
				else {
					incArgs.push('prerelease');
					incArgs.push(options.versionLadder[0]);
				}
				break;

			case 'patch':
			case 'minor':
			case 'major':
				incArgs.push(options.series);
				break;

			default:
				if(!semver.valid(options.series)) {
					incArgs.length = 0;
					throw new Error(`Unknown series: ${options.series}`);
				}
				break;
		}

		debug(`incrementing version using semver.inc(${incArgs.join(', ')})`);
		const nextVersion = incArgs.length ? semver.inc(...incArgs) : options.series;

		debug(`${currentVersion} will be bumped to ${nextVersion}`);
		if(execMode === 'api')
			logger?.info?.(`${currentVersion} will be bumped to ${nextVersion}`);
		else
			logger?.succeed?.(`Preparing to bump current version: ${currentVersion} to next version: ${nextVersion}`);

		return nextVersion;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	PrepareCommandClass
	 * @name		_getTargetFileList
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 *
	 * @return		{string} List of files in which the current version should be replaced with the new version
	 *
	 * @summary  	Looks at all the files in the project folder/sub-folders, removes files ignored by .gitignore, then removes files in folders marked ignore in the config, and returns the remaining.
	 *
	 */
	async _getTargetFileList(options, logger) {
		const { 'fdir': FDir } = require('fdir');
		const path = require('path');

		const execMode = options?.execMode ?? 'cli';

		debug(`crawling ${process.cwd()}`);
		if(execMode === 'api')
			logger?.debug?.(`crawling ${process.cwd()}s`);
		else
			logger.text = `crawling ${process.cwd()}s`;

		const crawler = new FDir().withFullPaths().crawl(process.cwd());
		let targetFiles = await crawler.withPromise();

		try {
			// eslint-disable-next-line node/no-missing-require
			const fileSystem = require('fs/promises');
			const gitIgnorePath = path.join(process.cwd(), '.gitignore');

			debug(`processing ${gitIgnorePath}`);
			let gitIgnoreFile = await fileSystem.readFile(gitIgnorePath, { 'encoding': 'utf8' });
			gitIgnoreFile += `\n\n**/.git\n${options.ignoreFolders.map((ignoredEntity) => { return ignoredEntity.trim(); }).join('\n')}\n\n`;

			gitIgnoreFile = gitIgnoreFile
			.split('\n')
			.map((gitIgnoreLine) => {
				if(gitIgnoreLine.trim().length === 0)
					return gitIgnoreLine.trim();

				if(gitIgnoreLine.startsWith('#'))
					return gitIgnoreLine;

				if(gitIgnoreLine.startsWith('**/'))
					return gitIgnoreLine;

				return `${gitIgnoreLine}\n**/${gitIgnoreLine}`;
			})
			.filter((gitIgnoreLine) => {
				return gitIgnoreLine.length;
			})
			.join('\n\n');

			debug(`.gitignore used:\n${gitIgnoreFile}`);

			debug(`parsing ${gitIgnorePath}`);
			const gitIgnoreParser = require('gitignore-parser');
			const gitIgnore = gitIgnoreParser.compile(gitIgnoreFile);

			debug(`applying .gitignore to possible targets`);
			targetFiles = targetFiles.filter(gitIgnore.accepts);
		}
		catch(err) {
			debug(`problem processing .gitignore: ${err.message}\n${err.stack}`);
		}

		return targetFiles;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	PrepareCommandClass
	 * @name		_bumpVersion
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 * @param		{string} currentVersion - String representing the current version in package.json that needs to be replaced
	 * @param		{string} nextVersion - String representing the next version of the package
	 * @param		{Array} targetFiles - List of files where the current version string should be replaced with the new version string
	 *
	 * @return		{null} Nothing
	 *
	 * @summary  	Replaces the old version string with the new version string.
	 *
	 */
	async _bumpVersion(options, logger, currentVersion, nextVersion, targetFiles) {
		const execMode = options?.execMode ?? 'cli';

		debug(`modifying version to ${nextVersion} in: ${targetFiles.join(', ')}`);
		if(execMode === 'api') logger?.debug?.(`modifying version to ${nextVersion} in: ${targetFiles.join(', ')}`);

		const path = require('path');
		const replaceInFile = require('replace-in-file');
		const replaceOptions = {
			'files': '',
			'from': '',
			'to': nextVersion
		};

		if(execMode !== 'api') {
			logger?.succeed?.(`Modifying target files:`);
			if(logger) logger.prefixText = '  ';
		}
		else {
			logger?.info?.(`modifying target files now`);
		}

		for(const targetFile of targetFiles) {
			// eslint-disable-next-line curly
			if(!options.quiet) {
				if(execMode === 'api')
					logger?.debug?.(`processing ${targetFile}`);
				else
					logger.text = `processing ${targetFile}...`;
			}

			replaceOptions.files = targetFile;
			if(path.basename(targetFile).startsWith('package'))
				replaceOptions.from = new RegExp(currentVersion, 'i');
			else
				replaceOptions.from = new RegExp(currentVersion, 'gi');

			const results = await replaceInFile(replaceOptions);
			if(!results.length) continue;

			results.forEach((result) => {
				if(!result.hasChanged)
					return;

				debug(`${result.file} bumped to ${nextVersion}`);
				// eslint-disable-next-line curly
				if(!options.quiet) {
					if(execMode === 'api')
						logger?.debug?.(`${result.file} bumped to ${nextVersion}`);
					else
						logger?.succeed?.(`processed ${result.file}`);
				}
			});
		}

		if(execMode !== 'api' && logger)
			logger.prefixText = '';
	}
	// #endregion

	// #region Private Fields
	// #endregion
}

// Add the command to the cli
let commandObj = null;
exports.commandCreator = function commandCreator(commanderProcess, configuration) {
	if(!commandObj) commandObj = new PrepareCommandClass(configuration?.prepare);

	commanderProcess
		.command('prepare')
		.option('-ss, --series <type>', 'Specify the series of the next release (current, next, patch, minor, major)', 'current')
		.option('-vl, --version-ladder <stages>', 'Specify the series releases used in the project', (configuration?.prepare?.versionLadder ?? 'dev, alpha, beta, rc, patch, minor, major'))
		.option('-if, --ignore-folders <folder list>', 'Comma-separated list of folders to ignore when checking for files containing the current version string', (configuration?.prepare?.ignoreFolders ?? ''))
		.action(commandObj.execute.bind(commandObj));

	return;
};

// Export the API for usage by downstream programs
exports.apiCreator = function apiCreator() {
	if(!commandObj) commandObj = new PrepareCommandClass({ 'execMode': 'api' });
	return {
		'name': 'prepare',
		'method': commandObj.execute.bind(commandObj)
	};
};
