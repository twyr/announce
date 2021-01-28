/* eslint-disable security/detect-object-injection */
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
const debug = debugLib('announce:publish');

/**
 * @class		PublishCommandClass
 * @classdesc	The command class that handles all the publish operations.
 *
 * @param		{object} configuration - The configuration object containing the command options from the config file (.announcerc, package.json, etc.)
 *
 * @description
 * The command class that implements the "publish" step of the workflow.
 * Please see README.md for the details of what this step involves.
 *
 */
class PublishCommandClass {
	// #region Constructor
	constructor(configuration) {
		Object.defineProperty(this, '_commandOptions', {
			'writeable': true,
			'value': configuration ?? {}
		});
	}
	// #endregion

	// #region Public Methods
	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof PublishCommandClass
	 * @name     execute
	 *
	 * @param    {object} options - Parsed command-line options, or options passed in via API
	 *
	 * @return {null} Nothing.
	 *
	 * @summary  The main method to publish the Github release to NPM.
	 *
	 * This method does 2 things:
	 * - Gets the URL to the compressed asset for the last/specified release from Github
	 * - Publishes the asset to NPM
	 *
	 */
	async execute(options) {
		const path = require('path');
		const simpleGit = require('simple-git');
		const safeJsonStringify = require('safe-json-stringify');

		// Get package.json into memory... we'll use it in multiple places here
		const projectPackageJson = path.join(process.cwd(), 'package.json');
		const pkg = require(projectPackageJson);

		// Setup sane defaults for the options
		const mergedOptions = {};
		mergedOptions.execMode = this?._commandOptions?.execMode ?? 'cli';

		mergedOptions.debug = options?.debug ?? (options?.parent?.debug ?? false);
		mergedOptions.silent = options?.silent ?? (options?.parent?.silent ?? false);
		mergedOptions.quiet = options?.quiet ?? (options?.parent?.quiet ?? false);

		mergedOptions.quiet = mergedOptions.quiet || mergedOptions.silent;

		mergedOptions.access = options?.access ?? (this?._commandOptions?.access ?? 'public');
		mergedOptions.distTag = options?.distTag ?? (this?._commandOptions?.distTag ?? 'latest');
		mergedOptions.dryRun = options?.dryRun ?? (this?._commandOptions?.dryRun ?? false);

		mergedOptions.githubToken = options?.githubToken ?? (this?._commandOptions?.githubToken ?? process.env.GITHUB_TOKEN);
		mergedOptions.npmToken = options?.npmToken ?? (this?._commandOptions?.npmToken ?? process.env.NPM_TOKEN);

		mergedOptions.releaseName = options?.releaseName ?? (this?._commandOptions.releaseName ?? `V${pkg.version} Release`);
		mergedOptions.upstream = options?.upstream ?? (this?._commandOptions.upstream ?? 'upstream');

		// Setting up the logs, according to the options passed in
		if(mergedOptions.debug) debugLib.enable('announce:*');

		let logger = null;
		const execMode = mergedOptions.execMode;

		if((execMode === 'api') && !mergedOptions.silent) { // eslint-disable-line curly
			logger = options?.logger;
		}

		if((execMode === 'cli') && !mergedOptions.silent) {
			const Ora = require('ora');
			logger = new Ora({
				'discardStdin': true,
				'text': `Publishing...`
			});

			logger?.start?.();
		}

		debug(`publishing with options - ${safeJsonStringify(mergedOptions)}`);

		try {
			// Step 1: Initialize the Git VCS API for the current working directory, get remote repository, trailer messages, etc.
			const git = simpleGit?.({
				'baseDir': process.cwd()
			})
			.outputHandler((_command, stdout, stderr) => {
				// if(!mergedOptions.quiet) stdout.pipe(process.stdout);
				stderr.pipe(process.stderr);
			});

			debug(`initialized Git for the repository @ ${process.cwd()}`);
			if(execMode === 'api' && !mergedOptions.quiet) logger?.debug?.(`initialized Git for the repository @ ${process.cwd()}`);

			// Step 2: Create the URL for the release
			const hostedGitInfo = require('hosted-git-info');
			const gitRemotes = await git?.raw?.(['remote', 'get-url', '--push', mergedOptions?.upstream]);

			const repository = hostedGitInfo?.fromUrl?.(gitRemotes);
			repository.project = repository?.project?.replace?.('.git\n', '');

			debug(`repository info - ${safeJsonStringify(repository, null, '\t')}`);
			if(execMode === 'api' && !mergedOptions.quiet) logger?.debug?.(`repository info - ${safeJsonStringify(repository)}`);

			// Step 3: Get the release details from Github
			debug(`retrieving ${mergedOptions?.releaseName} release from github`);
			if(execMode === 'api' && !mergedOptions.quiet)
				logger?.debug?.(`retrieving ${mergedOptions?.releaseName} release from github`);
			else
				if(logger) logger.text = `Retrieving ${mergedOptions?.releaseName} release from github...`;

			const githubReleases = await this?._getFromGithub?.(mergedOptions, `https://api.${repository.domain}/repos/${repository.user}/${repository.project}/releases`);
			const releaseToBePublished = githubReleases?.filter?.((release) => { return (release?.name === mergedOptions?.releaseName); })?.shift?.();
			if(!releaseToBePublished) throw new Error(`Unknown Release: ${mergedOptions.releaseName}`);
			if(releaseToBePublished?.draft) throw new Error(`Cannot publish draft release: ${mergedOptions.releaseName}`);

			debug(`retrieved ${mergedOptions?.releaseName} release from github`);
			if(execMode === 'api')
				logger?.info?.(`retrieved ${mergedOptions?.releaseName} release from github`);
			else
				logger?.succeed?.(`Retrieved ${mergedOptions?.releaseName} release from github.`);

			// eslint-disable-next-line curly
			if((mergedOptions?.distTag ?? 'version_default') === 'version_default') {
				if(releaseToBePublished?.prerelease)
					mergedOptions.distTag = 'next';
				else
					mergedOptions.distTag = 'latest';
			}

			// Step 4: Run the npm publish command with the specified options
			debug(`publishing ${mergedOptions?.releaseName} release to npm`);
			if(execMode === 'api' && !mergedOptions.quiet)
				logger?.debug?.(`publishing ${mergedOptions?.releaseName} release to npm`);
			else
				if(logger) logger.text = `Publishing ${mergedOptions?.releaseName} release to npm...`;

			const execa = require('execa');

			const publishOptions = ['publish'];
			publishOptions?.push?.(`--tag ${mergedOptions.distTag}`);
			publishOptions?.push?.(`--access ${mergedOptions.access}`);
			if(mergedOptions?.dryRun) publishOptions?.push?.('--dry-run');
			publishOptions?.push(releaseToBePublished?.tarball_url);

			const publishProcess = execa?.('npm', publishOptions, {'all': true });
			publishProcess?.stdout?.pipe?.(process.stdout);
			publishProcess?.stderr?.pipe(process.stderr);

			await publishProcess;

			debug(`published ${mergedOptions?.releaseName} release: npm ${publishOptions.join(' ')}`);
			if(execMode === 'api')
				logger?.info?.(`published ${mergedOptions?.releaseName} release: npm ${publishOptions.join(' ')}`);
			else
				logger?.succeed?.(`Published ${mergedOptions?.releaseName} release to npm.`);
		}
		catch(err) {
			if(execMode === 'api')
				logger?.error?.(err.message);
			else
				logger?.fail?.(err.message);

			throw err;
		}
	}
	// #endregion

	// #region Private Methods
	async _getFromGithub(mergedOptions, url) {
		const Promise = require('bluebird');

		return new Promise((resolve, reject) => {
			try {
				const octonode = require('octonode');
				const client = octonode?.client?.(mergedOptions?.githubToken);
				debug('created client to connect to github');

				client?.get?.(url, {}, (err, status, body) => {
					if(err) {
						reject?.(err);
						return;
					}

					if(status !== 200) {
						reject?.(status);
						return;
					}

					resolve?.(body);
				});
			}
			catch(err) {
				reject?.(err);
			}
		});
	}
	// #endregion

	// #region Private Fields
	// #endregion
}

// Add the command to the cli
let commandObj = null;
exports.commandCreator = function commandCreator(commanderProcess, configuration) {
	if(!commandObj) commandObj = new PublishCommandClass(configuration?.publish);

	// Get package.json into memory... we'll use it in multiple places here
	const path = require('path');
	const projectPackageJson = path.join(process.cwd(), 'package.json');
	const { version } = require(projectPackageJson);

	commanderProcess
		.command('publish')
		.option('--access <level>', 'Public / Restricted', 'public')
		.option('--dist-tag <tag>', 'Tag to use for the published release', 'version_default')
		.option('--dry-run', 'Dry run publish', false)

		.option('-gt, --github-token <token>', 'Token to use for accessing the release on Github', process.env.GITHUB_TOKEN)
		.option('-nt, --npm-token <token>', 'Automation Token to use for publishing the release to NPM', process.env.NPM_TOKEN)

		.option('-rn, --release-name <name>', 'Github release name for fetching the compressed assets', `V${version} Release`)
		.option('-u, --upstream <remote>', 'Git remote to use for accessing the release', configuration?.publish?.upstream ?? 'upstream')

		.action(commandObj.execute.bind(commandObj));

	return;
};

// Export the API for usage by downstream programs
exports.apiCreator = function apiCreator() {
	if(!commandObj) commandObj = new PublishCommandClass({ 'execMode': 'api' });
	return {
		'name': 'publish',
		'method': commandObj.execute.bind(commandObj)
	};
};
