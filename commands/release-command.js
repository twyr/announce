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
const safeJsonStringify = require('safe-json-stringify');

/**
 * Module dependencies, required for this module
 * @ignore
 */
const debugLib = require('debug');
const debug = debugLib('announce:release');

/**
 * @class		ReleaseCommandClass
 * @classdesc	The command class that handles all the release operations.
 *
 * @param		{object} configuration - The configuration object containing the command options from the config file (.announcerc, package.json, etc.)
 *
 * @description
 * The command class that implements the "release" step of the workflow.
 * Please see README.md for the details of what this step involves.
 *
 */
class ReleaseCommandClass {
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
	 * @memberof ReleaseCommandClass
	 * @name     execute
	 *
	 * @param    {object} options - Parsed command-line options, or options passed in via API
	 *
	 * @return {null} Nothing.
	 *
	 * @summary  The main method to tag/release the codebase on Github.
	 *
	 * This method does 3 things:
	 * - Generates the changelog - features/fixes added to the code since the last tag/release
	 * - Commits, tags, pushes to Github
	 * - Creates a release using the tag and the generated changelog
	 *
	 */
	async execute(options) {
		// Step 1: Setup sane defaults for the options
		const mergedOptions = this._mergeOptions(options);

		// Step 2: Set up the logger according to the options passed in
		const logger = this._setupLogger(mergedOptions);

		// Step 3: Initialize Git client for the project repository
		const git = this._initializeGit(mergedOptions, logger);

		// Step 4: Stash or Commit the current branch, if required
		let shouldPopOnError = false;

		try {
			shouldPopOnError = await this._stashOrCommit(mergedOptions, logger, git);

			// Step 5: Generate the CHANGELOG and commit it
			await this._generateChangelog(mergedOptions, logger, git);

			// Step 6: Tag the last commit, if required
			await this._tagCode(mergedOptions, logger, git);

			// Step 7: Push the new commits, and tag, upstream
			await this._pushUpstream(mergedOptions, logger, git);

			// Step 8: Create the release notes...
			const releaseData = await this._generateReleaseNotes(mergedOptions, logger, git);

			// Step 9: Create the release on Github
			await this?._releaseCode?.(mergedOptions, logger, releaseData);

			// Step 10: Store the release notes at the specified location in the specified formats
			await this?._storeReleaseNotes?.(mergedOptions, logger, releaseData);
		}
		finally {
			// Step 11: pop the stash if needed...
			if(shouldPopOnError) {
				await git?.stash?.(['pop']);

				const execMode = options?.execMode ?? 'cli';
				if(execMode === 'api')
					logger?.info?.(`Popped the stash`);
				else
					logger?.succeed?.(`Popped the stash`);
			}
		}
	}
	// #endregion

	// #region Private Methods
	/**
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
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
		const { version } = require(projectPackageJson);

		const mergedOptions = {};
		mergedOptions.execMode = this?._commandOptions?.execMode ?? 'cli';

		mergedOptions.debug = options?.debug ?? (options?.parent?.debug ?? false);
		mergedOptions.silent = options?.silent ?? (options?.parent?.silent ?? false);
		mergedOptions.quiet = options?.quiet ?? (options?.parent?.quiet ?? false);

		mergedOptions.quiet = mergedOptions.quiet || mergedOptions.silent;

		mergedOptions.commit = options?.commit ?? (this?._commandOptions?.commit ?? false);
		mergedOptions.githubToken = options?.githubToken ?? (this?._commandOptions?.githubToken ?? process.env.GITHUB_TOKEN);
		mergedOptions.gitlabToken = options?.gitlabToken ?? (this?._commandOptions?.gitlabToken ?? process.env.GITLAB_TOKEN);

		mergedOptions.message = options?.message ?? (this?._commandOptions?.message ?? '');

		mergedOptions.dontTag = options?.dontTag ?? (this?._commandOptions.dontTag ?? false);
		mergedOptions.tag = options?.tag ?? (this?._commandOptions.tag ?? '');
		mergedOptions.tagName = options?.tagName ?? (this?._commandOptions.tagName ?? `V${version}`);
		mergedOptions.tagMessage = options?.tagMessage ?? (this?._commandOptions.tagMessage ?? `The spaghetti recipe at the time of releasing V${version}`);

		mergedOptions.dontRelease = options?.dontRelease ?? (this?._commandOptions.dontRelease ?? false);
		mergedOptions.releaseName = options?.releaseName ?? (this?._commandOptions.releaseName ?? `V${version} Release`);
		mergedOptions.releaseMessage = options?.releaseMessage ?? (this?._commandOptions.releaseMessage ?? '');

		mergedOptions.outputFormat = options?.outputFormat ?? (this?._commandOptions.outputFormat ?? '');
		mergedOptions.outputPath = options?.outputPath ?? (this?._commandOptions.outputPath ?? '.');
		if(!path?.isAbsolute?.(mergedOptions?.outputPath)) mergedOptions.outputPath = path?.join?.(process?.cwd?.(), mergedOptions?.outputPath);

		mergedOptions.upstream = options?.upstream ?? (this?._commandOptions.upstream ?? 'upstream');

		return mergedOptions;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
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
	 * @memberof	ReleaseCommandClass
	 * @name		_initializeGit
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 *
	 * @return		{object} The Git client instance for the project repository.
	 *
	 * @summary  	Creates a Git client instance for the current project repository and returns it.
	 *
	 */
	_initializeGit(options, logger) {
		const execMode = options?.execMode ?? 'cli';

		// eslint-disable-next-line curly
		if(!options.quiet) {
			if(execMode === 'api')
				logger?.debug?.(`Initializing Git for the repository @ ${process.cwd()}`);
			else
				if(logger) logger.text = `Initializing Git for the repository @ ${process.cwd()}`;
		}

		const simpleGit = require('simple-git');
		const git = simpleGit?.({
			'baseDir': process.cwd()
		})
		.outputHandler?.((_command, stdout, stderr) => {
			// if(!mergedOptions.quiet) stdout.pipe(process.stdout);
			stderr.pipe(process.stderr);
		});

		if(execMode === 'api')
			logger?.info?.(`Initialized Git for the repository @ ${process.cwd()}`);
		else
			logger?.succeed?.(`Initialized Git for the repository @ ${process.cwd()}`);

		debug(`initialized Git for the repository @ ${process.cwd()}`);
		return git;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_stashOrCommit
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 * @param		{object} git - Git client instance returned by the _initializeGit method
	 *
	 * @return		{boolean} status of the stash/commit operation.
	 *
	 * @summary  	Depending on the configuration, stashes/commits code in the current branch - if required.
	 *
	 */
	async _stashOrCommit(options, logger, git) {
		const execMode = options?.execMode ?? 'cli';

		const gitOperation = options?.commit ? 'commit' : 'stash';
		const branchStatus = await git?.status?.();

		debug(`checking ${branchStatus.current} branch to see if a ${gitOperation} operation is required`);
		// eslint-disable-next-line curly
		if(!options.quiet) {
			if(execMode === 'api')
				logger?.debug?.(`Checking ${branchStatus.current} branch to see if a ${gitOperation} operation is required`);
			else
				if(logger) logger.text = `Checking ${branchStatus.current} branch to see if a ${gitOperation} operation is required`;
		}

		if(!branchStatus?.files?.length) {
			// eslint-disable-next-line curly
			if(!options.quiet) {
				if(execMode === 'api')
					logger?.info?.(`${branchStatus.current} branch clean - ${gitOperation} operation not required`);
				else
					logger?.succeed?.(`"${branchStatus.current}" branch is clean - ${gitOperation} operation not required`);
			}

			debug(`${branchStatus.current} branch clean - ${gitOperation} operation not required.`);
			return false;
		}

		debug(`${branchStatus.current} branch dirty - proceeding with ${gitOperation} operation`);
		// eslint-disable-next-line curly
		if(!options.quiet) {
			if(execMode === 'api')
				logger?.debug?.(`${branchStatus.current} branch is dirty - proceeding with ${gitOperation} operation`);
			else
				if(logger) logger.text = `${branchStatus.current} branch is dirty - proceeding with ${gitOperation} operation`;
		}

		let stashOrCommitStatus = null;
		if(gitOperation === 'stash') {
			stashOrCommitStatus = await git?.stash?.(['push']);
		}
		else {
			const es6DynTmpl = require('es6-dynamic-template');
			const path = require('path');

			const projectPackageJson = path.join(process.cwd(), 'package.json');
			const pkg = require(projectPackageJson);

			const commitMessage = es6DynTmpl?.(options?.message, pkg);
			debug(`Commit message: ${commitMessage}`);

			let trailerMessages = await git?.raw?.('interpret-trailers', path.join(__dirname, '../.gitkeep'));
			trailerMessages = trailerMessages?.replace?.(/\\n/g, '\n')?.replace(/\\t/g, '\t');
			debug(`Trailer messages: ${trailerMessages}`);

			const consolidatedMessage = `${(commitMessage ?? '')} ${(trailerMessages ?? '')}`;
			stashOrCommitStatus = await git?.commit?.(consolidatedMessage, null, {
				'--all': true,
				'--allow-empty': true,
				'--signoff': true
			});

			stashOrCommitStatus = stashOrCommitStatus?.commit;
		}

		if(execMode === 'api')
			logger?.info?.(`Branch "${branchStatus.current}" ${gitOperation} process done`);
		else
			logger?.succeed?.(`Branch "${branchStatus.current}" ${gitOperation} process done.`);

		debug(`${gitOperation} status: ${JSON.stringify((stashOrCommitStatus ?? {}), null, '\t')}`);
		return true;
	}


	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_generateChangelog
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 * @param		{object} git - Git client instance returned by the _initializeGit method
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Generates a CHANGELOG from the relevant Git Log events, and commits the modified file.
	 *
	 */
	async _generateChangelog(options, logger, git) {
		const execMode = options?.execMode ?? 'cli';

		debug(`generating the changelog containing significant git log events from the last tag`);
		// eslint-disable-next-line curly
		if(!options.quiet) {
			if(execMode === 'api')
				logger?.debug?.(`Generating CHANGELOG containing significant Git log events from the last tag`);
			else
				if(logger) logger.text = `Generating CHANGELOG containing significant Git log events from the last tag`;
		}

		if(options?.dontTag || (options.tag !== '')) {
			if(execMode === 'api')
				logger?.info?.(`Existing tag specified, or --dont-tag is true. Skipping CHANGELOG generation`);
			else
				logger?.succeed?.(`Existing tag specified, or --dont-tag is true. Skipping CHANGELOG generation`);

			debug(`existing tag specified, or --dont-tag is true - skipping CHANGELOG generation`);
			return;
		}

		// Step 1: Get the last tag, the commit for the last tag, and the last commit
		let lastTag = await git?.tag?.(['--sort=-creatordate']);
		lastTag = lastTag?.split?.('\n')?.shift()?.replace?.(/\\n/g, '')?.trim?.();

		let lastTaggedCommit = null;
		if(lastTag) {
			lastTaggedCommit = await git?.raw?.(['rev-list', '-n', '1', `tags/${lastTag}`]);
			lastTaggedCommit = lastTaggedCommit?.replace?.(/\\n/g, '')?.trim?.();
		}

		let lastCommit = await git?.raw?.(['rev-parse', 'HEAD']);
		lastCommit = lastCommit?.replace?.(/\\n/g, '')?.trim?.();

		// Step 2: Get the Git Log events from the last commit to the commit of the last tag
		let gitLogsInRange = null;

		if(lastTaggedCommit && lastCommit)
			gitLogsInRange = await git?.log?.({
				'from': lastTaggedCommit,
				'to': lastCommit
			});

		if(!lastTaggedCommit && lastCommit)
			gitLogsInRange = await git?.log?.({
				'to': lastCommit
			});

		if(!lastTaggedCommit && !lastCommit)
			gitLogsInRange = {
				'all': []
			};

		// Step 3: Filter the Git Logs - keep only the ones relevant to the CHANGELOG (features, bug fixes, and documentation)
		const relevantGitLogs = [];
		gitLogsInRange?.all?.forEach?.((commitLog) => {
			// eslint-disable-next-line curly
			if(commitLog?.message?.startsWith?.('feat(') || commitLog?.message?.startsWith?.('fix(') || commitLog?.message?.startsWith?.('docs(')) {
				relevantGitLogs?.push?.({
					'hash': commitLog?.hash,
					'date': commitLog?.date,
					'message': commitLog?.message,
					'author_name': commitLog?.author_name,
					'author_email': commitLog?.author_email
				});
			}

			// eslint-disable-next-line curly
			if(commitLog?.message?.startsWith?.('feat:') || commitLog?.message?.startsWith?.('fix:') || commitLog?.message?.startsWith?.('docs:')) {
				relevantGitLogs?.push?.({
					'hash': commitLog?.hash,
					'date': commitLog?.date,
					'message': commitLog?.message,
					'author_name': commitLog?.author_name,
					'author_email': commitLog?.author_email
				});
			}

			const commitLogBody = commitLog?.body?.replace?.(/\\r\\n/g, '\n')?.replace(/\\n/g, '\n')?.split?.('\n');
			commitLogBody?.forEach?.((commitBody) => {
				// eslint-disable-next-line curly
				if(commitBody?.startsWith?.('feat(') || commitBody?.startsWith?.('fix(') || commitBody?.startsWith?.('docs(')) {
					relevantGitLogs.push?.({
						'hash': commitLog?.hash,
						'date': commitLog?.date,
						'message': commitBody?.trim(),
						'author_name': commitLog?.author_name,
						'author_email': commitLog?.author_email
					});
				}

				// eslint-disable-next-line curly
				if(commitBody?.startsWith?.('feat:') || commitBody?.startsWith?.('fix:') || commitBody?.startsWith?.('docs:')) {
					relevantGitLogs.push?.({
						'hash': commitLog?.hash,
						'date': commitLog?.date,
						'message': commitBody?.trim(),
						'author_name': commitLog?.author_name,
						'author_email': commitLog?.author_email
					});
				}
			});
		});

		if(!relevantGitLogs.length) {
			if(execMode === 'api')
				logger?.info?.(`No significant Git Log events between the last tag and the current commit. Skipping CHANGELOG generation`);
			else
				logger?.succeed?.(`No significant Git Log events between the last tag and the current commit. Skipping CHANGELOG generation`);

			debug(`no significant Git Log events between the last tag and the current commit - skipping CHANGELOG generation`);
			return;
		}

		// Step 4: Get the upstream repository information - to be used to generate the URLs pointing to the commits
		const upstreamRemoteList = options?.upstream?.split?.(',')?.map?.((remote) => { return remote?.trim?.(); })?.filter?.((remote) => { return !!remote.length; });
		const upstreamForLinks = upstreamRemoteList?.shift?.();

		const gitRemote = await git?.raw?.(['remote', 'get-url', '--push', upstreamForLinks]);

		const hostedGitInfo = require('hosted-git-info');
		const repository = hostedGitInfo?.fromUrl?.(gitRemote);
		repository.project = repository?.project?.replace?.('.git\n', '');

		let gitHostWrapper = null;
		if(repository?.domain?.toLowerCase?.()?.includes?.('github')) {
			const GitHubWrapper = require('./../git_host_utilities/github').GitHubWrapper;
			gitHostWrapper = new GitHubWrapper(options?.githubToken);
		}

		if(repository?.domain?.toLowerCase?.()?.includes?.('gitlab')) {
			const GitLabWrapper = require('./../git_host_utilities/gitlab').GitLabWrapper;
			gitHostWrapper = new GitLabWrapper(options?.gitlabToken);
		}

		// Step 5: Generate the changelogs - prepend to an existing file, or create a whole new one
		const changeLogText = [`#### CHANGE LOG`];
		const processedDates = [];

		const dateFormat = require('date-fns/format');
		relevantGitLogs?.forEach?.((commitLog) => {
			const commitDate = dateFormat?.(new Date(commitLog?.date), 'dd-MMM-yyyy');
			if(!processedDates?.includes?.(commitDate)) {
				processedDates?.push?.(commitDate);
				changeLogText?.push?.(`\n\n##### ${commitDate}`);
			}

			const commitLink = gitHostWrapper.getCommitLink(repository, commitLog);
			changeLogText?.push?.(`\n${commitLog?.message} ([${commitLog?.hash}](${commitLink})`);
		});

		const path = require('path');
		const replaceInFile = require('replace-in-file');
		while(changeLogText.length) {
			const thisChangeSet = [];

			let thisChangeLog = changeLogText?.pop?.();
			while(changeLogText?.length && !thisChangeLog?.startsWith?.('\n\n####')) {
				thisChangeSet?.unshift?.(thisChangeLog);
				thisChangeLog = changeLogText?.pop?.();
			}

			thisChangeSet?.unshift?.(thisChangeLog);

			const replaceOptions = {
				'files': path.join(process.cwd(), 'CHANGELOG.md'),
				'from': thisChangeLog,
				'to': thisChangeSet?.join?.('\n')
			};

			const changelogResult = await replaceInFile?.(replaceOptions);
			if(changelogResult?.[0]?.['hasChanged'])
				continue;

			if(!changeLogText.length)
				continue;

			const prependFile = require('prepend-file');

			while(thisChangeSet?.length) changeLogText?.push?.(thisChangeSet?.shift?.());
			await prependFile?.(path.join(process.cwd(), 'CHANGELOG.md'), changeLogText?.join?.('\n'));

			break;
		}

		// Step 6: Commit the CHANGELOG
		const branchStatus = await git?.status?.();
		if(!branchStatus?.files?.length) {
			if(execMode === 'api')
				logger?.info?.(`No CHANGELOG events. Skipping commit operation`);
			else
				logger?.succeed?.(`No CHANGELOG events. Skipping commit operation`);

			debug(`no CHANGELOG events - skipping commit operation`);
			return;
		}

		const projectPackageJson = path.join(process.cwd(), 'package.json');
		const pkg = require(projectPackageJson);

		let trailerMessages = await git?.raw?.('interpret-trailers', path.join(__dirname, '../.gitkeep'));
		trailerMessages = trailerMessages?.replace?.(/\\n/g, '\n')?.replace(/\\t/g, '\t');

		const consolidatedMessage = `docs(CHANGELOG): generated change log for release ${pkg?.version}\n${trailerMessages ?? ''}`;

		await git?.add?.('.');
		await git?.commit?.(consolidatedMessage, null, {
			'--allow-empty': true,
			'--no-verify': true
		});

		// Finally, return...
		if(execMode === 'api')
			logger?.info?.(`Generated CHANGELOG containing significant Git log events from the last tag`);
		else
			logger?.succeed?.(`Generated CHANGELOG containing significant Git log events from the last tag`);

		debug(`generated CHANGELOG containing significant Git log events from the last tag`);
		return;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_tagCode
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 * @param		{object} git - Git client instance returned by the _initializeGit method
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary		Tags the codebase.
	 *
	 */
	async _tagCode(options, logger, git) {
		const execMode = options.execMode;

		debug(`tagging commit with the CHANGELOG...`);
		// eslint-disable-next-line curly
		if(!options.quiet) {
			if(execMode === 'api')
				logger?.debug?.(`Tagging commit with the CHANGELOG`);
			else
				if(logger) logger.text = `Tagging commit with the CHANGELOG`;
		}

		if(options?.dontTag || (options.tag !== '')) {
			if(execMode === 'api')
				logger?.info?.(`Existing tag specified, or --dont-tag is true. Skipping tag operation`);
			else
				logger?.succeed?.(`Existing tag specified, or --dont-tag is true. Skipping tag operation`);

			debug(`existing tag specified or --dont-tag is true - skipping tag operation`);
			return;
		}

		const es6DynTmpl = require('es6-dynamic-template');
		const path = require('path');

		const projectPackageJson = path.join(process.cwd(), 'package.json');
		const pkg = require(projectPackageJson);

		const tagName = es6DynTmpl?.(options?.tagName, pkg);
		const tagMessage = es6DynTmpl?.(options?.tagMessage, pkg);

		let lastCommit = await git?.raw?.(['rev-parse', 'HEAD']);
		lastCommit = lastCommit?.replace?.(/\\n/g, '')?.trim?.();

		if(!lastCommit) {
			if(execMode === 'api')
				logger?.info?.(`No commits found in the repository. Skipping tag operation`);
			else
				logger?.succeed?.(`No commits found in the repository. Skipping tag operation`);

			debug(`no commits found in the repository - skipping tag operation`);
			return;
		}

		await git?.tag?.(['-a', '-f', '-m', tagMessage, tagName, lastCommit]);

		if(execMode === 'api')
			logger?.info?.(`Tag ${tagName}: ${tagMessage} created`);
		else
			logger?.succeed?.(`Tag ${tagName}: ${tagMessage} created`);

		debug(`tag ${tagName}: ${tagMessage} created`);
		return;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_pushUpstream
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 * @param		{object} git - Git client instance returned by the _initializeGit method
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary		Pushes new commits/tags to the configured upstream git remote.
	 *
	 */
	async _pushUpstream(options, logger, git) {
		const execMode = options.execMode;

		debug(`pushing commits and tag upstream...`);
		// eslint-disable-next-line curly
		if(!options.quiet) {
			if(execMode === 'api')
				logger?.debug?.(`Pushing commits and tag upstream`);
			else
				if(logger) logger.text = `Pushing commits and tag upstream`;
		}

		const branchStatus = await git?.status?.();
		// if(!branchStatus?.ahead) {
		// 	if(execMode === 'api')
		// 		logger?.info?.(`Skipping push upstream operation - no commits/tags to push`);
		// 	else
		// 		logger?.succeed?.(`Skipping push upstream operation - no commits/tags to push`);

		// 	debug(`skipping push upstream operation - no commits/tags to push`);
		// 	return;
		// }

		const upstreamRemoteList = options?.upstream?.split?.(',')?.map?.((remote) => { return remote?.trim?.(); })?.filter?.((remote) => { return !!remote.length; });
		for(let idx = 0; idx < upstreamRemoteList.length; idx++) {
			const thisUpstreamRemote = upstreamRemoteList[idx];

			await git?.push?.(thisUpstreamRemote, branchStatus?.current, {
				'--atomic': true,
				'--progress': true,
				'--signed': 'if-asked'
			});

			await git?.pushTags?.(thisUpstreamRemote, {
				'--atomic': true,
				'--force': true,
				'--progress': true,
				'--signed': 'if-asked'
			});
		}

		if(execMode === 'api')
			logger?.info?.(`Pushed ${branchStatus.current} branch commits and tags upstream to ${options?.upstream}`);
		else
			logger?.succeed?.(`Pushed ${branchStatus.current} branch commits and tags upstream to ${options?.upstream}.`);

		debug(`pushed ${branchStatus.current} branch tags upstream to ${options?.upstream}`);
		return;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_generateReleaseNotes
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 * @param		{object} git - Git client instance returned by the _initializeGit method
	 *
	 * @return		{string} The generated release notes for this release.
	 *
	 * @summary		Fetches the last release information from Github, generates notes from current tag to the last released tag, and returns the generated notes as a string.
	 *
	 */
	async _generateReleaseNotes(options, logger, git) {
		const execMode = options.execMode;

		debug(`generating release notes...`);
		// eslint-disable-next-line curly
		if(!options.quiet) {
			if(execMode === 'api')
				logger?.debug?.(`Generating release notes`);
			else
				if(logger) logger.text = `Generating release notes...`;
		}

		if(options?.dontRelease) {
			if(execMode === 'api')
				logger?.info?.(`--dont-release is true. Skipping release notes generation`);
			else
				logger?.succeed?.(`--dont-release is true. Skipping release notes generation`);

			debug(`--dont-release is true - skipping release notes generation`);
			return null;
		}

		// Get release notes for each of the configured upstreams...
		const upstreamRemoteList = options?.upstream?.split?.(',')?.map?.((remote) => { return remote?.trim?.(); })?.filter?.((remote) => { return !!remote.length; });
		const releaseData = {};
		for(let idx = 0; idx < upstreamRemoteList.length; idx++) {
			const thisUpstreamRemote = upstreamRemoteList[idx];
			const upstreamReleaseNotes = await this._generateReleaseNotesPerRemote(options, logger, git, thisUpstreamRemote);

			releaseData[thisUpstreamRemote] = upstreamReleaseNotes;
		}

		// Finally, return...
		if(execMode === 'api')
			logger?.info?.(`Generated release notes`);
		else
			logger?.succeed?.(`Generated release notes.`);

		debug(`generated release notes.`);
		return releaseData;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_releaseCode
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 * @param		{object} releaseData - Data needed to push the release, returned by _generateReleaseNotes
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary		Creates a release on Github, and marks it as pre-release if required.
	 *
	 */
	async _releaseCode(options, logger, releaseData) {
		const execMode = options?.execMode;

		debug(`creating the release...`);
		// eslint-disable-next-line curly
		if(!options.quiet) {
			if(execMode === 'api')
				logger?.debug?.(`Creating the release...`);
			else
				if(logger) logger.text = `Creating the release...`;
		}

		if(options?.dontRelease) {
			if(execMode === 'api')
				logger?.info?.(`--dont-release is true. Skipping create release operation`);
			else
				logger?.succeed?.(`--dont-release is true. Skipping create release operation`);

			debug(`--dont-release is true - skipping create release operation`);
			return;
		}

		// Iterate over each release upstream, and call the git host wrapper...
		const upstreamRemoteList = options?.upstream?.split?.(',')?.map?.((remote) => { return remote?.trim?.(); })?.filter?.((remote) => { return !!remote.length; });
		for(let idx = 0; idx < upstreamRemoteList.length; idx++) {
			const thisUpstreamRemote = upstreamRemoteList[idx];
			const upstreamReleaseData = releaseData[thisUpstreamRemote];

			let gitHostWrapper = null;
			if(upstreamReleaseData?.REPO?.type === 'github') {
				const GitHubWrapper = require('./../git_host_utilities/github').GitHubWrapper;
				gitHostWrapper = new GitHubWrapper(options?.githubToken);
			}

			if(upstreamReleaseData?.REPO?.type === 'gitlab') {
				const GitLabWrapper = require('./../git_host_utilities/gitlab').GitLabWrapper;
				gitHostWrapper = new GitLabWrapper(options?.gitlabToken);
			}

			await gitHostWrapper.createRelease(upstreamReleaseData);
		}

		if(execMode === 'api')
			logger?.info?.(`Created the release`);
		else
			logger?.succeed?.(`Created the release`);


		debug(`created the release`);
		return;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_storeReleaseNotes
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 * @param		{object} releaseData - Data needed to push the release, returned by _generateReleaseNotes
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary		Stores the release notes in the specified formats, at the specified location.
	 *
	 */
	async _storeReleaseNotes(options, logger, releaseData) {
		const execMode = options ?.execMode;

		debug(`storing the generated release notes...`);
		// eslint-disable-next-line curly
		if(!options.quiet) {
			if(execMode === 'api')
				logger?.debug?.(`Storing the generated release notes...`);
			else
				if(logger) logger.text = `Storing the generated release notes...`;
		}

		if(options?.dontRelease) {
			if(execMode === 'api')
				logger?.info?.(`--dont-release is true. Skipping storing generated release notes operation`);
			else
				logger?.succeed?.(`--dont-release is true. Skipping storing generated release notes operation`);

			debug(`--dont-release is true - skipping storing generated release notes operation`);
			return;
		}

		// Step 1: If path is not specified, skip
		if(options?.outputPath.trim() === '') {
			if(execMode === 'api')
				logger?.info?.(`No requirement to store the release notes. Skipping operation`);
			else
				logger?.succeed?.(`No requirement to store the release notes. Skipping operation`);

			debug(`skipping operation to store generated release notes`);
			return;
		}

		// Step 2: Convert generated release notes in the specified formats
		let outputFormats = options?.outputFormat?.trim?.().split(',').map((format) => { return format?.trim?.(); }).filter((format) => { return format?.length && (format !== 'none'); });
		if(!outputFormats.length) {
			if(execMode === 'api')
				logger?.error?.(`No valid output formats specified for storing generated release notes. Skipping operation`);
			else
				logger?.fail?.(`No valid output formats specified for storing generated release notes. Skipping operation`);

			debug(`no valid output formats specified for storing generated release notes - skipping operation`);
			return;
		}

		if(outputFormats.includes('all'))
			outputFormats = ['json', 'pdf'];


		for(let idx = 0; idx < outputFormats.length; idx++) {
			const thisOutputFormat = outputFormats[idx];
			switch (thisOutputFormat) {
				case 'json':
					await this?._storeJsonReleaseNotes(options, logger, releaseData);
					break;

				case 'pdf':
					await this?._storePdfReleaseNotes(options, logger, releaseData);
					break;

				default:
					if(execMode === 'api')
						logger?.error?.(`Invalid output format specified for storing generated release notes: ${thisOutputFormat}`);
					else
						logger?.fail?.(`Invalid output format specified for storing generated release notes: ${thisOutputFormat}`);

					debug(`invalid output format specified for storing generated release notes - ${thisOutputFormat}`);
					break;
			}
		}

		// Finally, return..
		if(execMode === 'api')
			logger?.info?.(`Stored the release notes @ ${options?.outputPath}`);
		else
			logger?.succeed?.(`Stored the release notes @ ${options?.outputPath}`);

		debug(`stored the release notes`);
		return;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_generateReleaseNotesPerRemote
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 * @param		{object} logger - Logger instance returned by the _setupLogger method
	 * @param		{object} git - Git client instance returned by the _initializeGit method
	 * @param		{string} remote - The remote for which the release notes should be generated
	 *
	 * @return		{string} The generated release notes for this release.
	 *
	 * @summary		Fetches the last release information from Github, generates notes from current tag to the last released tag, and returns the generated notes as a string.
	 *
	 */
	async _generateReleaseNotesPerRemote(options, logger, git, remote) {
		// Step 1: Get upstream repository info to use for getting required details...
		const gitRemote = await git?.raw?.(['remote', 'get-url', '--push', remote]);

		const hostedGitInfo = require('hosted-git-info');
		const repository = hostedGitInfo?.fromUrl?.(gitRemote);
		repository.project = repository?.project?.replace?.('.git\n', '');

		// Step 2: Get the last release for the repository
		let gitHostWrapper = null;
		if(repository?.type === 'github') {
			const GitHubWrapper = require('./../git_host_utilities/github').GitHubWrapper;
			gitHostWrapper = new GitHubWrapper(options?.githubToken);
		}

		if(repository?.type === 'gitlab') {
			const GitLabWrapper = require('./../git_host_utilities/gitlab').GitLabWrapper;
			gitHostWrapper = new GitLabWrapper(options?.gitlabToken);
		}

		const lastRelease = await gitHostWrapper.fetchReleaseInformation(repository);

		// Step 3: Get the last released commit, and the most recent tag / specified tag commit
		let lastReleasedCommit = null;
		if(lastRelease) {
			lastReleasedCommit = await git?.raw?.(['rev-list', '-n', '1', `tags/${lastRelease?.tag}`]);
			lastReleasedCommit = lastReleasedCommit?.replace?.(/\\n/g, '')?.trim?.();
		}

		let lastTag = await git?.tag?.(['--sort=-creatordate']);
		// If a specific tag name is not given, use the commit associated with the last tag
		if(options?.tag === '')
			lastTag = lastTag?.split?.('\n')?.shift?.()?.replace?.(/\\n/g, '')?.trim?.();
		// Otherwise, use the commit associated with the specified tag
		else
			lastTag = lastTag?.split?.('\n')?.filter?.((tagName) => { return tagName?.replace?.(/\\n/g, '')?.trim?.() === options?.tag; })?.shift()?.replace?.(/\\n/g, '')?.trim();

		let lastCommit = null;
		if(lastTag) {
			lastCommit = await git?.raw?.(['rev-list', '-n', '1', `tags/${lastTag}`]);
			lastCommit = lastCommit?.replace?.(/\\n/g, '')?.trim?.();
		}

		// Step 4: Get the Git Log events from the commit of the last release to the commit of the last tag
		let gitLogsInRange = null;
		if(lastReleasedCommit && lastCommit)
			gitLogsInRange = await git?.log?.({
				'from': lastReleasedCommit,
				'to': lastCommit
			});

		if(!lastReleasedCommit && lastCommit)
			gitLogsInRange = await git?.log?.({
				'to': lastCommit
			});

		if(!lastReleasedCommit && !lastCommit)
			gitLogsInRange = {
				'all': []
			};

		// Step 5: Filter the Git Logs - keep only the ones relevant to the release notes (features, bug fixes, and documentation)
		const dateFormat = require('date-fns/format');

		const relevantGitLogs = [];
		gitLogsInRange?.all?.forEach?.((commitLog) => {
			const commitDate = dateFormat(new Date(commitLog?.date), 'dd-MMM-yyyy');

			// eslint-disable-next-line curly
			if(commitLog?.message?.startsWith?.('feat') || commitLog?.message?.startsWith?.('fix') || commitLog?.message?.startsWith?.('docs')) {
				relevantGitLogs?.push?.({
					'hash': commitLog?.hash,
					'date': commitDate,
					'message': commitLog?.message,
					'author_name': commitLog?.author_name,
					'author_email': commitLog?.author_email
				});
			}

			const commitLogBody = commitLog?.body?.replace?.(/\\r\\n/g, '\n')?.replace?.(/\\n/g, '\n')?.split?.('\n');
			commitLogBody?.forEach?.((commitBody) => {
				// eslint-disable-next-line curly
				if(commitBody?.startsWith?.('feat') || commitBody?.startsWith?.('fix') || commitBody?.startsWith?.('docs')) {
					relevantGitLogs?.push?.({
						'hash': commitLog?.hash,
						'date': commitDate,
						'message': commitBody?.trim?.(),
						'author_name': commitLog?.author_name,
						'author_email': commitLog?.author_email
					});
				}
			});
		});

		// Step 6: Fetch Author information for each of the relevant Git Log events
		const contributorSet = {};
		let authorProfiles = [];

		relevantGitLogs?.forEach?.((commitLog) => {
			if(!Object.keys(contributorSet)?.includes?.(commitLog?.['author_email'])) {
				contributorSet[commitLog['author_email']] = commitLog?.['author_name'];
				authorProfiles?.push?.(gitHostWrapper?.fetchCommitAuthorInformation?.(repository, commitLog));
			}
		});

		authorProfiles = await Promise?.allSettled?.(authorProfiles);
		authorProfiles = authorProfiles.map((authorProfile) => {
			return authorProfile?.value;
		})
		.filter((authorProfile) => {
			return !!authorProfile?.email?.trim?.()?.length;
		});

		// Step 7: Bucket the Git Log events based on the Conventional Changelog fields
		const featureSet = [];
		const bugfixSet = [];
		const documentationSet = [];

		const humanizeString = require('humanize-string');
		relevantGitLogs?.forEach?.((commitLog) => {
			const commitObject = {
				'hash': commitLog?.hash,
				'component': '',
				'message': commitLog?.message,
				'author_name': commitLog?.['author_name'],
				'author_email': commitLog?.['author_email'],
				'author_profile': authorProfiles?.filter?.((author) => { return author?.email === commitLog?.author_email; })?.[0]?.['profile'],
				'date': commitLog?.date
			};

			let set = null;
			if(commitLog?.message?.startsWith?.('feat')) {
				commitObject.message = commitObject?.message?.replace?.('feat', '');
				set = featureSet;
			}

			if(commitLog?.message?.startsWith?.('fix')) {
				commitObject.message = commitObject?.message?.replace?.('fix', '');
				set = bugfixSet;
			}

			if(commitLog?.message?.startsWith?.('docs')) {
				commitObject.message = commitObject?.message?.replace?.('docs', '');
				set = documentationSet;
			}

			if(!commitObject?.message?.startsWith?.('(') && !commitObject?.message?.startsWith?.(':'))
				return;

			if(commitObject?.message?.startsWith?.('(')) {
				const componentClose = commitObject?.message?.indexOf?.(':') - 2;
				commitObject.component = commitObject?.message?.substr?.(1, componentClose);

				commitObject.message = commitObject?.message?.substr?.(componentClose + 3);
			}

			// eslint-disable-next-line curly
			if(commitObject?.message?.startsWith?.(':')) {
				commitObject.message = commitObject?.message?.substr?.(1);
			}

			commitObject.message = humanizeString?.(commitObject?.message);
			set?.push?.(commitObject);
		});

		// Step 8: Compute if this is a pre-release, or a proper release
		const path = require('path');
		const semver = require('semver');

		const projectPackageJson = path.join(process.cwd(), 'package.json');
		const { version } = require(projectPackageJson);

		if(!version) {
			debug(`package.json at ${projectPackageJson} doesn't contain a version field.`);
			throw new Error(`package.json at ${projectPackageJson} doesn't contain a version field.`);
		}
		if(!semver.valid(version)) {
			debug(`${projectPackageJson} contains a non-semantic-version format: ${version}`);
			throw new Error(`${projectPackageJson} contains a non-semantic-version format: ${version}`);
		}

		const parsedVersion = semver?.parse?.(version);
		const releaseType = parsedVersion?.prerelease?.length ? 'pre-release' : 'release';

		// Step 9: Generate the release notes
		const releaseData = {
			'REPO': repository,
			'RELEASE_NAME': options?.releaseName,
			'RELEASE_TYPE': releaseType,
			'RELEASE_TAG': lastTag,
			'NUM_FEATURES': featureSet?.length,
			'NUM_FIXES': bugfixSet?.length,
			'NUM_DOCS': documentationSet?.length,
			'NUM_AUTHORS': authorProfiles?.length,
			'FEATURES': featureSet,
			'FIXES': bugfixSet,
			'DOCS': documentationSet,
			'AUTHORS': authorProfiles
		};

		let releaseMessagePath = options?.releaseMessage ?? '';
		if(releaseMessagePath === '') releaseMessagePath = './../templates/release-notes.ejs';
		if(!path.isAbsolute(releaseMessagePath)) releaseMessagePath = path.join(__dirname, releaseMessagePath);

		const promises = require('bluebird');
		const ejs = promises?.promisifyAll?.(require('ejs'));

		releaseData['RELEASE_NOTES'] = await ejs?.renderFileAsync?.(releaseMessagePath, releaseData, {
			'async': true,
			'cache': false,
			'debug': false,
			'rmWhitespace': false,
			'strict': false
		});

		// Step 10: Clean up a bit...
		delete releaseData['REPO']['protocols'];
		delete releaseData['REPO']['treepath'];
		delete releaseData['REPO']['auth'];
		delete releaseData['REPO']['committish'];
		delete releaseData['REPO']['default'];
		delete releaseData['REPO']['opts'];

		// Finally, return...
		return releaseData;
	}

	async _storeJsonReleaseNotes(options, logger, releaseData) {
		// eslint-disable-next-line node/no-missing-require
		const fs = require('fs/promises');
		const mkdirp = require('mkdirp');
		const path = require('path');

		const upstreamRemoteList = options?.upstream?.split?.(',')?.map?.((remote) => { return remote?.trim?.(); })?.filter?.((remote) => { return !!remote.length; });
		for(let idx = 0; idx < upstreamRemoteList.length; idx++) {
			const thisUpstreamRemote = upstreamRemoteList?.[idx];

			const upstreamReleaseData = JSON?.parse?.(safeJsonStringify?.(releaseData?.[thisUpstreamRemote]));
			delete upstreamReleaseData['RELEASE_NOTES'];

			await mkdirp(options?.outputPath);

			const filePath = path?.join?.(options?.outputPath, `${thisUpstreamRemote}-release-notes-${upstreamReleaseData['RELEASE_NAME'].toLowerCase().replace(/ /g, '-')}.json`);
			await fs?.writeFile?.(filePath, safeJsonStringify?.(upstreamReleaseData, null, '\t'));
		}
	}

	async _storePdfReleaseNotes(options, logger, releaseData) {
		// eslint-disable-next-line node/no-missing-require
		const fs = require('fs/promises');
		const mkdirp = require('mkdirp');
		const path = require('path');

		const upstreamRemoteList = options?.upstream?.split?.(',')?.map?.((remote) => { return remote?.trim?.(); })?.filter?.((remote) => { return !!remote.length; });
		for(let idx = 0; idx < upstreamRemoteList.length; idx++) {
			const thisUpstreamRemote = upstreamRemoteList[idx];

			const { mdToPdf } = require('md-to-pdf');
			const upstreamReleaseData = releaseData?.[thisUpstreamRemote]?.['RELEASE_NOTES'];
			const pdf = await mdToPdf({ 'content': upstreamReleaseData });

			await mkdirp(options?.outputPath);

			const filePath = path?.join?.(options?.outputPath, `${thisUpstreamRemote}-release-notes-${releaseData?.[thisUpstreamRemote]?.['RELEASE_NAME'].toLowerCase().replace(/ /g, '-')}.pdf`);
			await fs.writeFile(filePath, pdf.content);
		}
	}
	// #endregion

	// #region Private Fields
	// #endregion
}

// Add the command to the cli
let commandObj = null;
exports.commandCreator = function commandCreator(commanderProcess, configuration) {
	if(!commandObj) commandObj = new ReleaseCommandClass(configuration?.release);

	// Get package.json into memory... we'll use it in multiple places here
	const path = require('path');
	const projectPackageJson = path.join(process.cwd(), 'package.json');
	const pkg = require(projectPackageJson);

	commanderProcess
		.command('release')
		.option('-c, --commit', 'Commit code if branch is dirty', configuration?.release?.commit ?? false)
		.option('-ght, --github-token <token>', 'Token to use for creating the release on GitHub', process.env.GITHUB_TOKEN)
		.option('-glt, --gitlab-token <token>', 'Token to use for creating the release on GitLab', process.env.GITLAB_TOKEN)

		.option('-m, --message', 'Commit message if branch is dirty. Ignored if --commit is not passed in', configuration?.release?.message ?? '')

		.option('--dont-tag', 'Don\'t tag now. Use the last tag when cutting this release', configuration?.release?.dontTag ?? false)
		.option('--tag <name>', 'Use the (existing) tag specified when cutting this release', configuration?.release?.tag?.trim() ?? '')
		.option('-tn, --tag-name <name>', 'Tag Name to use for this release', `V${pkg.version}`)
		.option('-tm, --tag-message <message>', 'Message to use when creating the tag.', `The spaghetti recipe at the time of releasing V${pkg.version}`)

		.option('--dont-release', 'Don\'t release now. Simply tag and exit', configuration?.release?.dontRelease ?? false)
		.option('-rn, --release-name <name>', 'Name to use for this release', `V${pkg.version} Release`)
		.option('-rm, --release-message <path to release notes EJS>', 'Path to EJS file containing the release message/notes, with/without a placeholder for auto-generated metrics', configuration?.release?.releaseMessage ?? '')

		.option('-of, --output-format <json|pdf|all>', 'Format(s) to output the generated release notes', configuration?.release?.outputFormat ?? 'none')
		.option('-op, --output-path <release notes path>', 'Path to store the generated release notes at', configuration?.release?.outputPath ?? '.')

		.option('-u, --upstream <remotes-list>', 'Comma separated list of git remote(s) to push the release to', configuration?.release?.upstream ?? 'upstream')
		.action(commandObj.execute.bind(commandObj));

	return;
};

// Export the API for usage by downstream programs
exports.apiCreator = function apiCreator() {
	if(!commandObj) commandObj = new ReleaseCommandClass({ 'execMode': 'api' });
	return {
		'name': 'release',
		'method': commandObj.execute.bind(commandObj)
	};
};
