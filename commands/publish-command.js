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
		// Step 1: Setup sane defaults for the options
		const mergedOptions = this._mergeOptions(options);

		// Step 2: Set up the logger according to the options passed in
		const logger = this._setupLogger(mergedOptions);

		// Step 3: Get the upstream repository information - this is the one where the to-be-published release assets are hosted.
		const repository = await this._getUpstreamRepositoryInfo(mergedOptions, logger);

		// Step 4: Get the details of the to-be-published release from Github
		const releaseToBePublished = await this._getReleaseAssetInformation(mergedOptions, logger, repository);

		// Step 5: Run the npm publish command with the specified options
		await this._publishToNpm(mergedOptions, logger, releaseToBePublished);
	}
	// #endregion

	// #region Private Methods
	/**
	 * @function
	 * @instance
	 * @memberof	PublishCommandClass
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
		const path = require('path');
		const projectPackageJson = path.join(process.cwd(), 'package.json');
		const pkg = require(projectPackageJson);

		const mergedOptions = options ?? {};
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

		return mergedOptions;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	PublishCommandClass
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
	 * @async
	 * @function
	 * @instance
	 * @memberof	PublishCommandClass
	 * @name		_getUpstreamRepositoryInfo
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 *
	 * @return		{object} POJO with information about the upstream repository URL, etc.
	 *
	 * @summary  	Instantiates a Git instance for the project, retrieves the upstream repository information, and returns a POJO with that info.
	 *
	 */
	async _getUpstreamRepositoryInfo(options, logger) {
		const safeJsonStringify = require('safe-json-stringify');
		const simpleGit = require('simple-git');

		const git = simpleGit?.({
			'baseDir': process.cwd()
		})
		.outputHandler((_command, stdout, stderr) => {
			stderr.pipe(process.stderr);
		});

		debug(`initialized Git for the repository @ ${process.cwd()}`);
		const execMode = options?.execMode ?? 'cli';

		// eslint-disable-next-line curly
		if(!options?.quiet) {
			if(execMode === 'api')
				logger?.debug?.(`initialized Git for the repository @ ${process.cwd()}. Fetching upstream repository information.`);
			else
				if(logger) logger.text = `Initialized Git for the repository @ ${process.cwd()}. Fetching upstream repository information...`;
		}

		const gitRemote = await git?.raw?.(['remote', 'get-url', '--push', options?.upstream]);

		const hostedGitInfo = require('hosted-git-info');
		const repository = hostedGitInfo?.fromUrl?.(gitRemote);
		repository.project = repository?.project?.replace?.('.git\n', '');

		// eslint-disable-next-line curly
		if(!options?.quiet) {
			if(execMode === 'api')
				logger?.info?.(`Fetched information for the ${repository.user}/${repository.project} upstream`);
			else
				logger?.succeed?.(`Fetched information for the ${repository.user}/${repository.project} upstream.`);
		}

		debug(`repository info - ${safeJsonStringify(repository, null, '\t')}`);
		return repository;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	PublishCommandClass
	 * @name		_getReleaseAssetInformation
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 * @param		{object} repository - POJO containing information about the project/repo on Github hosting the assets
	 *
	 * @return		{object} POJO with information about the assets to-be-published.
	 *
	 * @summary  	Connects to the Github project pointed to in the configured upstream, retrieves information about the release to-be-published, and retuns that.
	 *
	 */
	async _getReleaseAssetInformation(options, logger, repository) {
		debug(`retrieving ${options?.releaseName} release from github`);
		const execMode = options?.execMode ?? 'cli';

		// eslint-disable-next-line curly
		if(!options?.quiet) {
			if(execMode === 'api')
				logger?.debug?.(`retrieving ${options?.releaseName} release from Github`);
			else
				if(logger) logger.text = `Retrieving ${options?.releaseName} release from Github...`;
		}

		const githubReleases = await this?._getFromGithub?.(options, `https://api.${repository.domain}/repos/${repository.user}/${repository.project}/releases`);
		const releaseToBePublished = githubReleases?.filter?.((release) => { return (release?.name === options?.releaseName); })?.shift?.();

		if(!releaseToBePublished) throw new Error(`Unknown Release: ${options.releaseName}`);
		if(releaseToBePublished?.draft) throw new Error(`Cannot publish draft release: ${options.releaseName}`);

		debug(`retrieved ${options?.releaseName} release from github`);
		// eslint-disable-next-line curly
		if(!options?.quiet) {
			if(execMode === 'api')
				logger?.debug?.(`retrieved ${options?.releaseName} release from github`);
			else
				logger?.succeed?.(`Retrieved ${options?.releaseName} release details from Github.`);
		}

		return releaseToBePublished;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	PublishCommandClass
	 * @name		_publishToNpm
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 * @param		{object} releaseToBePublished - POJO with information about the assets to-be-published
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Retrieves the release assets from Github, and publishes them to NPM.
	 *
	 */
	async _publishToNpm(options, logger, releaseToBePublished) {
		debug(`publishing ${options?.releaseName} release to npm`);
		const execMode = options?.execMode ?? 'cli';

		// eslint-disable-next-line curly
		if(!options?.quiet) {
			if(execMode === 'api')
				logger?.debug?.(`publishing ${options?.releaseName} release to npm`);
			else
				if(logger) logger.text = `Publishing ${options?.releaseName} release to npm...`;
		}

		let distTag = null;

		// eslint-disable-next-line curly
		if((options?.distTag ?? 'version_default') === 'version_default') {
			if(releaseToBePublished?.prerelease)
				distTag = 'next';
			else
				distTag = 'latest';
		}

		const publishOptions = ['publish'];
		publishOptions?.push(releaseToBePublished?.tarball_url);
		publishOptions?.push?.(`--tag ${distTag}`);
		publishOptions?.push?.(`--access ${options.access}`);
		if(options?.dryRun) publishOptions?.push?.('--dry-run');

		const execa = require('execa');
		const publishProcess = execa?.('npm', publishOptions, {'all': true });
		publishProcess?.stdout?.pipe?.(process.stdout);
		publishProcess?.stderr?.pipe?.(process.stderr);

		await publishProcess;

		debug(`published ${options?.releaseName} release: npm ${publishOptions.join(' ')}`);
		if(execMode === 'api')
			logger?.info?.(`published ${options?.releaseName} release: npm ${publishOptions.join(' ')}`);
		else
			logger?.succeed?.(`Published ${options?.releaseName} release to npm.`);
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	PublishCommandClass
	 * @name		 _getFromGithub
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{string} url - the url giving the information we seek
	 *
	 * @return		{object} Hopefully, the required information from Github.
	 *
	 * @summary  	Given a Github REST API endpoint, call it and give back the information returned.
	 *
	 */
	async _getFromGithub(options, url) {
		const Promise = require('bluebird');

		return new Promise((resolve, reject) => {
			try {
				const octonode = require('octonode');
				const client = octonode?.client?.(options?.githubToken);
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
