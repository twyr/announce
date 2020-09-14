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
 * @param		{object} logger - The logger instance
 *
 * @description
 * The "prepare" command is the first-of-three-steps in the Twy'r release workflow.
 *
 * In this phase, the workflow simply increments the current version of the package
 * (as defined in the root level package.json) to the next version - either in the
 * same series or the next.
 *
 * The "version ladder" from release-to-release is usually defined as:
 * dev => alpha => beta => rc => patch / minor / major => dev(next-version)
 *
 * Each "stage" in the version ladder is considered a "series" - either "single-step" or
 * "multi-step". If the series is "multi-step" (consists of multiple steps), each "step"
 * contains additional version information for unique identification of the "step" within
 * the series.
 *
 * The dev / alpha / beta / rc series are "multi-step", and therefore, each step
 * in the series is identified with the {{series}}.{{step number}} label [dev.0, dev.1,
 * alpha.0, etc.]
 *
 * The patch / minor / major series are considered "single step", and therefore identified
 * with a canonical "semantic version" {{major.minor.patch}} [1.3.5, 2.0.3, etc.]
 *
 * dev => alpha => beta are usually "private" releases, and are (typically) not available
 * to anyone outside the development team. In certain cases, beta releases may be made
 * available to a restricted set of outsiders as part of "early feedback collection" cycle.
 *
 * The rc releases are usually made available to the general public, and typically released on
 * npm tagged as "@next". This is done for collecting feedback / bugs from the wider community,
 * as well as to give downstream packages/projects the time needed to make any changes mandated
 * by the new version - before the package is actually released.
 *
 * The patch / minor / major releases are considered "public" releases - in other words, they are
 * made available to "everyone" via the package registry and all users are encouraged to upgrade.
 *
 * Once a "public" release is done & dusted, development for the next set of changes is expected
 * to immediately begin - with the next (higher) version number and a "dev" series tag.
 *
 */
class PrepareCommandClass {
	// #region Constructor
	constructor(configuration, logger) {
		Object.defineProperty(this, '_commandOptions', {
			'value': configuration
		});

		Object.defineProperty(this, '_logger', {
			'value': logger ?? console
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
	 * @param    {object} options - Parsed command-line options.
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
		const path = require('path');
		const semver = require('semver');

		// Setup sane defaults for the options
		const mergedOptions = options ?? {};
		mergedOptions.debug = options?.debug ?? (options?.parent?.debug ?? false);
		mergedOptions.silent = options?.silent ?? (options?.parent?.silent ?? false);
		mergedOptions.quiet = options?.quiet ?? (options?.parent?.quiet ?? false);

		mergedOptions.series = options?.series ?? 'current';
		mergedOptions.versionLadder = options?.versionLadder ?? (this?._commandOptions?.versionLadder ?? 'dev, alpha, beta, rc, patch, minor, major');
		mergedOptions.versionLadder = mergedOptions.versionLadder.split(',').map((stage) => { return stage.trim(); });

		// Setting up the logs, according to the options passed in
		if(mergedOptions.debug) debugLib.enable('announce:*');
		let loggerFn = null;
		if(!mergedOptions.silent) { // eslint-disable-line curly
			if(mergedOptions.quiet)
				loggerFn = this._logger.info.bind(this._logger);
			else
				loggerFn = this._logger.debug.bind(this._logger);
		}

		// Step 1: Get the current version from package.json
		const projectPackageJson = path.join(process.cwd(), 'package.json');
		debug(`processing ${projectPackageJson}`);

		const { version } = require(projectPackageJson);
		if(!version) {
			debug(`package.json at ${projectPackageJson} doesn't contain a version field.`);
			throw new Error(`package.json at ${projectPackageJson} doesn't contain a version field.`);
		}
		if(!semver.valid(version)) {
			debug(`${projectPackageJson} contains a non-semantic-version format: ${version}`);
			throw new Error(`${projectPackageJson} contains a non-semantic-version format: ${version}`);
		}

		loggerFn?.(`${projectPackageJson} contains version ${version}`);
		debug(`${projectPackageJson} contains version ${version}`);

		// Step 2: Compute the next version
		debug(`applying ${mergedOptions.series} series to version ${version} using the ladder: ${JSON.stringify(mergedOptions.versionLadder)}`);

		const incArgs = [version];
		const parsedVersion = semver.parse(version);

		switch (mergedOptions.series) {
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

					const currentStep = mergedOptions.versionLadder.indexOf(preReleaseTag);
					if(currentStep === -1)
						preReleaseTag = 'patch';
					else if(currentStep === mergedOptions.versionLadder.length - 1)
						preReleaseTag = 'patch';
					else
						preReleaseTag = mergedOptions.versionLadder[currentStep + 1];

					if(preReleaseTag !== 'patch') incArgs.push('prerelease');
					incArgs.push(preReleaseTag);
				}
				else {
					incArgs.push('prerelease');
					incArgs.push(mergedOptions.versionLadder[0]);
				}
				break;

			case 'patch':
			case 'minor':
			case 'major':
				incArgs.push(mergedOptions.series);
				break;

			default:
				if(!semver.valid(mergedOptions.series)) {
					incArgs.length = 0;
					throw new Error(`Unknown series: ${mergedOptions.series}`);
				}
				break;
		}

		debug(`incrementing version using semver.inc(${incArgs.join(', ')})`);
		const nextVersion = incArgs.length ? semver.inc(...incArgs) : mergedOptions.series;

		debug(`Series "${mergedOptions.series}": ${version} will be bumped to ${nextVersion}`);
		loggerFn?.(`Series "${mergedOptions.series}": ${version} will be bumped to ${nextVersion}`);

		// Step 3: Get a hold of all the possible files where we need to change the version string.
		const { 'fdir': FDir } = require('fdir');
		const crawler = new FDir().withFullPaths().crawl(process.cwd());

		let targetFiles = await crawler.withPromise();
		// debug(`possible targets for version change: ${targetFiles.join(', ')}`);

		// eslint-disable-next-line security/detect-non-literal-fs-filename
		const fileSystem = require('fs/promises');
		let gitIgnoreFile = await fileSystem.readFile(path.join(process.cwd(), '.gitignore'), { 'encoding': 'utf8' });
		gitIgnoreFile += `\n\n${this?._commandOptions?.ignoreFolders.join('\n')}\n\n`;

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

		const gitIgnoreParser = require('gitignore-parser');
		const gitIgnore = gitIgnoreParser.compile(gitIgnoreFile);

		debug(`applying .gitignore to possible targets`);
		targetFiles = targetFiles.filter(gitIgnore.accepts);

		// Step 4: Replace current version strong with next version string in all the target files
		debug(`modifying version to ${nextVersion} in:\n${targetFiles.join('\n\t')}\n`);

		const replaceInFile = require('replace-in-file');
		const replaceOptions = {
			'files': '',
			'from': new RegExp(version, 'g'),
			'to': nextVersion
		};

		for(const targetFile of targetFiles) {
			replaceOptions.files = targetFile;
			const results = await replaceInFile(replaceOptions);

			if(!results.length) continue;
			results.forEach((result) => {
				if(!result.hasChanged)
					return;

				debug(`${result.file} bumped to ${nextVersion}`);
				loggerFn?.(`${result.file} bumped to ${nextVersion}`);
			});
		}

		loggerFn?.(`Done bumping version from ${version} to ${nextVersion}`);
		debug(`done bumping version from ${version} to ${nextVersion}`);
	}
	// #endregion

	// #region Private Fields
	// #endregion
}

// Add the command to the cli
let commandObj = null;
exports.commandCreator = function commandCreator(commanderProcess, configuration) {
	if(!commandObj) commandObj = new PrepareCommandClass(configuration?.prepare, console);

	commanderProcess
		.command('prepare')
		.option('--series <type>', 'Specify the series of the next release (current, next, patch, minor, major)', 'current')
		.option('--version-ladder <stages>', 'Specify the series releases used in the project', (configuration?.prepare?.versionLadder ?? 'dev, alpha, beta, rc, patch, minor, major'))
		.action(commandObj.execute.bind(commandObj));

	return;
};

// Export the API for usage by downstream programs
exports.apiCreator = function apiCreator(configuration, logger) {
	if(!commandObj) commandObj = new PrepareCommandClass(configuration?.prepare, logger);
	return {
		'name': 'prepare',
		'method': commandObj.execute.bind(commandObj)
	};
};
