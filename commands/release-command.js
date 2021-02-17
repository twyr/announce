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
		const es6DynTmpl = require('es6-dynamic-template');
		const path = require('path');
		const safeJsonStringify = require('safe-json-stringify');
		const simpleGit = require('simple-git');

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

		mergedOptions.commit = options?.commit ?? (this?._commandOptions?.commit ?? false);
		mergedOptions.githubToken = options?.githubToken ?? (this?._commandOptions?.githubToken ?? process.env.GITHUB_TOKEN);

		mergedOptions.message = options?.message ?? (this?._commandOptions?.message ?? '');

		mergedOptions.dontTag = options?.dontTag ?? (this?._commandOptions.dontTag ?? false);
		mergedOptions.tag = options?.tag ?? (this?._commandOptions.tag ?? '');
		mergedOptions.tagName = options?.tagName ?? (this?._commandOptions.tagName ?? `V${pkg.version}`);
		mergedOptions.tagMessage = options?.tagMessage ?? (this?._commandOptions.tagMessage ?? `The spaghetti recipe at the time of releasing V${pkg.version}`);

		mergedOptions.dontRelease = options?.dontRelease ?? (this?._commandOptions.dontRelease ?? false);
		mergedOptions.releaseName = options?.releaseName ?? (this?._commandOptions.releaseName ?? `V${pkg.version} Release`);
		mergedOptions.releaseMessage = options?.releaseMessage ?? (this?._commandOptions.releaseMessage ?? '');

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
				'text': `Releasing...`
			});

			logger?.start?.();
		}

		debug(`releasing with options - ${safeJsonStringify(mergedOptions)}`);

		let git = null;
		let shouldPopOnError = false;

		try {
			// Step 1: Initialize the Git VCS API for the current working directory, get remote repository, trailer messages, etc.
			git = simpleGit?.({
				'baseDir': process.cwd()
			})
			.outputHandler?.((_command, stdout, stderr) => {
				// if(!mergedOptions.quiet) stdout.pipe(process.stdout);
				stderr.pipe(process.stderr);
			});

			debug(`initialized Git for the repository @ ${process.cwd()}`);
			if(execMode === 'api' && !mergedOptions.quiet) logger?.debug?.(`initialized Git for the repository @ ${process.cwd()}`);

			// Step 2: Check if branch is dirty - commit/stash as required
			let stashOrCommitStatus = null;

			let branchStatus = await git?.status?.();
			if(branchStatus?.files?.length) {
				debug(`${branchStatus.current} branch is dirty. Starting ${mergedOptions?.commit ? 'commit' : 'stash'} process`);
				if(execMode === 'api' && !mergedOptions.quiet)
					logger?.debug?.(`${branchStatus.current} branch is dirty. Starting ${mergedOptions?.commit ? 'commit' : 'stash'} process`);
				else
					if(logger) logger.text = `Branch "${branchStatus.current}" is dirty. Starting ${mergedOptions?.commit ? 'commit' : 'stash'} process`;

				if(!mergedOptions?.commit) {
					stashOrCommitStatus = await git?.stash?.(['push']);
					shouldPopOnError = true;
				}
				else {
					const commitMessage = es6DynTmpl?.(mergedOptions?.message, pkg);
					debug(`Commit message: ${commitMessage}`);

					let trailerMessages = await git?.raw?.('interpret-trailers', path.join(__dirname, '../.gitkeep'));
					trailerMessages = trailerMessages?.replace?.(/\\n/g, '\n')?.replace(/\\t/g, '\t');
					debug(`Trailer messages: ${trailerMessages}`);

					const consolidatedMessage = (commitMessage ?? '') + (trailerMessages ?? '');
					stashOrCommitStatus = await git?.commit?.(consolidatedMessage, null, {
						'--all': true,
						'--allow-empty': true,
						'--signoff': true
					});

					stashOrCommitStatus = stashOrCommitStatus?.commit;
				}

				debug(`${mergedOptions.commit ? 'commit' : 'stash'} status: ${safeJsonStringify((stashOrCommitStatus ?? {}), null, '\t')}`);
				if(execMode === 'api')
					logger?.info?.(`${branchStatus.current} ${mergedOptions?.commit ? 'commit' : 'stash'} process done`);
				else
					logger?.succeed?.(`Branch "${branchStatus.current}" ${mergedOptions?.commit ? 'commit' : 'stash'} process done.`);
			}
			else {
				debug(`branch clean. No requirement to ${mergedOptions?.commit ? 'Commit' : 'Stash'}`);
				if(execMode === 'api')
					logger?.info?.(`${branchStatus.current} branch clean - proceeding`);
				else
					logger?.succeed?.(`Branch "${branchStatus.current}" is clean. Proceeding.`);
			}

			// Step 3: Generate CHANGELOG, commit it, and tag the code
			if((mergedOptions?.tag === '') && !mergedOptions?.dontTag) {
				debug(`tag name specified, and dontTag is false - starting tagging`);
				if(execMode === 'api' && !mergedOptions.quiet)
					logger?.debug?.(`tagging ${branchStatus.current} branch`);
				else
					logger?.succeed?.(`Tagging ${branchStatus.current} branch...`);

				await this?._tagCode?.(git, mergedOptions, logger);

				debug(`tagged ${branchStatus.current} branch`);
				if(execMode === 'api')
					logger?.info?.(`tagged ${branchStatus.current} branch`);
				else
					logger?.succeed?.(`Tagged ${branchStatus.current} branch.`);
			}
			else {
				debug(`tag specified, or --dont-tag is true - not tagging the code`);
				if(execMode === 'api')
					logger?.info?.(`tag name specified, or dontTag option passed in - skipping the tag`);
				else
					logger?.succeed?.(`Tag name specified or --dont-tag passed in. Skipping tagging the code`);
			}

			// Step 4: Push commits/tags to the specified upstream
			branchStatus = await git?.status?.();
			if(branchStatus?.ahead) {
				debug(`pushing ${branchStatus.current} branch commits upstream to ${mergedOptions?.upstream}`);
				if(execMode === 'api' && !mergedOptions.quiet)
					logger?.debug?.(`pushing ${branchStatus.current} branch commits upstream to ${mergedOptions?.upstream}`);
				else
					if(logger) logger.text = `Pushing ${branchStatus.current} branch commits upstream to ${mergedOptions?.upstream}...`;

				const pushCommitStatus = await git?.push?.(mergedOptions?.upstream, branchStatus?.current, {
					'--atomic': true,
					'--progress': true,
					'--signed': 'if-asked'
				});

				debug(`pushing ${branchStatus.current} branch tags upstream to ${mergedOptions?.upstream}`);
				if(execMode === 'api' && !mergedOptions.quiet)
					logger?.debug?.(`pushing ${branchStatus?.current} branch tags upstream to ${mergedOptions?.upstream}`);
				else
					if(logger) logger.text = `Pushing ${branchStatus?.current} branch tags upstream to ${mergedOptions?.upstream}...`;

				const pushTagStatus = await git?.pushTags?.(mergedOptions?.upstream, {
					'--atomic': true,
					'--force': true,
					'--progress': true,
					'--signed': 'if-asked'
				});

				debug(`pushed ${branchStatus.current} branch tags upstream to ${mergedOptions?.upstream}:\nCommit: ${safeJsonStringify((pushCommitStatus ?? {}), null, '\t')}\nTag: ${safeJsonStringify((pushTagStatus ?? {}), null, '\t')}`);
				if(execMode === 'api')
					logger?.info?.(`pushed ${branchStatus.current} branch commits and tags upstream to ${mergedOptions?.upstream}`);
				else
					logger?.succeed?.(`Pushed ${branchStatus.current} branch commits and tags upstream to ${mergedOptions?.upstream}.`);
			}

			// Step 5: Create the release notes, and create the release itself
			if(!mergedOptions?.dontRelease) {
				debug(`releasing to ${mergedOptions?.upstream}`);
				if(execMode === 'api' && !mergedOptions.quiet)
					logger?.debug?.(`releasing to ${mergedOptions?.upstream}`);
				else
					logger?.succeed?.(`Releasing to ${mergedOptions?.upstream}...`);

				await this?._releaseCode?.(git, mergedOptions, logger);

				debug(`released to ${mergedOptions?.upstream}`);
				if(execMode === 'api')
					logger?.info?.(`released to ${mergedOptions?.upstream}`);
				else
					logger?.succeed?.(`Released to ${mergedOptions?.upstream}...`);
			}
			else {
				debug(`--dont-release passed in - exiting without releasing`);
				if(execMode === 'api')
					logger?.info?.(`--dont-release passed in - exitng without releasing`);
				else
					logger?.succeed?.(`Skipping releasing - CLI option --dont-release passed in.`);
			}
		}
		catch(err) {
			if(execMode === 'api')
				logger?.error?.(`release process error: ${err.message}`);
			else
				logger?.fail?.(`Release process error: ${err.message}`);

			throw err;
		}
		// Finally, pop stash if necessary
		finally {
			if(shouldPopOnError) {
				debug(`restoring code - popping the stash`);
				if(execMode === 'api')
					logger?.debug?.(`restoring code - popping the stash`);
				else
					if(logger) logger.text = 'restoring code - popping the stash';

				await git?.stash?.(['pop']);

				debug(`restoring code - popped the stash`);
				if(execMode === 'api')
					logger?.info?.(`restored code - stash popped`);
				else
					logger?.succeed?.('Restored code - stash popped');
			}
		}
	}
	// #endregion

	// #region Private Methods
	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof ReleaseCommandClass
	 * @name     _tagCode
	 *
	 * @param    {object} git - GIT API instance
	 * @param    {object} mergedOptions - Parsed command-line options, or options passed in via API
	 * @param    {object} logger - Logger supporting the usual commands (debug, info, warn, error, etc.)
	 *
	 * @return {null} Nothing.
	 *
	 * @summary  Tags the codebase.
	 *
	 */
	async _tagCode(git, mergedOptions, logger) {
		const execMode = mergedOptions.execMode;

		const es6DynTmpl = require('es6-dynamic-template');
		const path = require('path');
		const safeJsonStringify = require('safe-json-stringify');

		// Get package.json into memory...
		const projectPackageJson = path.join(process.cwd(), 'package.json');
		const pkg = require(projectPackageJson);

		// Get trailer messages to append to git commit...
		let trailerMessages = await git?.raw?.('interpret-trailers', path.join(__dirname, '../.gitkeep'));
		trailerMessages = trailerMessages?.replace?.(/\\n/g, '\n')?.replace(/\\t/g, '\t');

		debug(`trailer messages: ${trailerMessages}`);
		// eslint-disable-next-line curly
		if(execMode === 'api' && !mergedOptions.quiet) {
			logger?.debug?.(`trailer messages: ${trailerMessages}`);
		}


		// Get upstream repository info to use for generating links to commits in the CHANGELOG...
		const hostedGitInfo = require('hosted-git-info');
		const gitRemotes = await git?.raw?.(['remote', 'get-url', '--push', mergedOptions?.upstream]);

		const repository = hostedGitInfo?.fromUrl?.(gitRemotes);
		repository.project = repository?.project?.replace?.('.git\n', '');

		debug(`repository info: ${safeJsonStringify(repository)}`);
		// eslint-disable-next-line curly
		if(execMode === 'api' && !mergedOptions.quiet) {
			logger?.debug?.(`repository info: ${safeJsonStringify(repository)}`);
		}

		// Step 1: Get the last tag, the commit that was tagged, and the most recent commit
		let lastTag = await git?.tag?.(['--sort=-creatordate']);
		lastTag = lastTag?.split?.('\n')?.shift()?.replace?.(/\\n/g, '')?.trim?.();

		let lastTaggedCommit = null;
		if(lastTag) {
			lastTaggedCommit = await git?.raw?.(['rev-list', '-n', '1', `tags/${lastTag}`]);
			lastTaggedCommit = lastTaggedCommit?.replace?.(/\\n/g, '')?.trim?.();
		}

		let lastCommit = await git?.raw?.(['rev-parse', 'HEAD']);
		lastCommit = lastCommit?.replace?.(/\\n/g, '')?.trim?.();

		debug(`last Tag: ${lastTag}, commit sha: ${lastTaggedCommit}, current commit sha: ${lastCommit}`);
		// eslint-disable-next-line curly
		if(execMode === 'api') {
			logger?.debug?.(`last Tag: ${lastTag}, commit sha: ${lastTaggedCommit}, current commit sha: ${lastCommit}`);
		}

		// Step 2: Generate the CHANGELOG using the commit messages in the git log - from the last tag to the most recent commit
		debug(`generating CHANGELOG.md`);
		if(execMode === 'api')
			logger?.debug?.(`generating CHANGELOG.md`);
		else
			if(logger) logger.text = 'Generating CHANGELOG.md...';

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

		const relevantGitLogs = [];
		gitLogsInRange?.all?.forEach?.((commitLog) => {
			// eslint-disable-next-line curly
			if(commitLog?.message?.startsWith?.('feat') || commitLog?.message?.startsWith?.('fix') || commitLog?.message?.startsWith?.('docs')) {
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
				if(commitBody?.startsWith?.('feat') || commitBody?.startsWith?.('fix') || commitBody?.startsWith?.('docs')) {
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

		const changeLogText = [`#### CHANGE LOG`];
		const processedDates = [];

		const dateFormat = require('date-fns/format');
		relevantGitLogs?.forEach?.((commitLog) => {
			const commitDate = dateFormat?.(new Date(commitLog?.date), 'dd-MMM-yyyy');
			if(!processedDates?.includes?.(commitDate)) {
				processedDates?.push?.(commitDate);
				changeLogText?.push?.(`\n\n##### ${commitDate}`);
			}

			changeLogText?.push?.(`\n${commitLog?.message} ([${commitLog?.hash}](https://${repository?.domain}/${repository?.user}/${repository?.project}/commit/${commitLog?.hash}))`);
		});

		if(changeLogText.length > 1) {
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
				if(changelogResult?.[0]?.['hasChanged']) continue;

				while(thisChangeSet?.length) changeLogText?.push?.(thisChangeSet?.shift?.());

				const prependFile = require('prepend-file');
				await prependFile?.(path.join(process.cwd(), 'CHANGELOG.md'), changeLogText?.join?.('\n'));
				break;
			}

			debug(`generated CHANGELOG.md`);
			if(execMode === 'api')
				logger?.info?.(`generated CHANGELOG.md`);
			else
				logger?.succeed?.('Generated CHANGELOG.md...');
		}

		// Step 3: Commit CHANGELOG
		const branchStatus = await git?.status?.();
		let tagCommitSha = null;

		if(branchStatus?.files?.length) {
			const addStatus = await git?.add?.('.');
			debug(`Added files to commit with status: ${safeJsonStringify(addStatus, null, '\t')}`);

			const consolidatedMessage = `docs(CHANGELOG): generated change log for release ${pkg?.version}\n${trailerMessages ?? ''}`;
			tagCommitSha = await git?.commit?.(consolidatedMessage, null, {
				'--allow-empty': true,
				'--no-verify': true
			});
			tagCommitSha = tagCommitSha?.commit;

			debug(`Committed change log: ${tagCommitSha}`);
			if(execMode === 'api')
				logger?.info?.(`committed CHANGELOG.md`);
			else
				logger?.succeed?.('Committed CHANGELOG.md...');
		}

		// Step 4: Tag this commit
		debug(`generating tag name / message...`);
		if(execMode === 'api')
			logger?.debug?.(`generating tag name / message`);
		else
			if(logger) logger.text = 'Generating tag name / message...';

		const tagName = es6DynTmpl?.(mergedOptions?.tagName, pkg);
		const tagMessage = es6DynTmpl?.(mergedOptions?.tagMessage, pkg);

		debug(`tagging the code`);
		if(execMode === 'api')
			logger?.debug?.(`tagging the code...`);
		else
			if(logger) logger.text = 'Tagging...';


		const tagStatus = await git?.tag?.(['-a', '-f', '-m', tagMessage, tagName, tagCommitSha || lastCommit]);

		debug(`tag ${tagName}: ${tagMessage} created with status: ${safeJsonStringify((tagStatus ?? {}), null, '\t')}`);
		if(execMode === 'api')
			logger?.info?.(`tag ${tagName}: ${tagMessage} created`);
		else
			logger?.succeed?.(`Tag ${tagName}: ${tagMessage} created`);
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof ReleaseCommandClass
	 * @name     _releaseCode
	 *
	 * @param    {object} git - GIT API instance
	 * @param    {object} mergedOptions - Parsed command-line options, or options passed in via API
	 * @param    {object} logger - Logger supporting the usual commands (debug, info, warn, error, etc.)
	 *
	 * @return {null} Nothing.
	 *
	 * @summary  Creates a release on Github, and marks it as pre-release if required.
	 *
	 */
	async _releaseCode(git, mergedOptions, logger) {
		const path = require('path');
		const safeJsonStringify = require('safe-json-stringify');

		// Step 1: Instantiate the Github Client for this repo
		const octonode = require('octonode');
		const client = octonode?.client?.(mergedOptions?.githubToken);

		const execMode = mergedOptions?.execMode;

		debug('created client to connect to github');
		// eslint-disable-next-line curly
		if(execMode === 'api' && !mergedOptions.quiet) {
			logger?.debug?.(`github client created`);
		}

		// Step 2: Get upstream repository info to use for getting required details...
		const hostedGitInfo = require('hosted-git-info');
		const gitRemotes = await git?.raw?.(['remote', 'get-url', '--push', mergedOptions?.upstream]);

		const repository = hostedGitInfo?.fromUrl?.(gitRemotes);
		repository.project = repository?.project?.replace?.('.git\n', '');

		debug(`repository Info: ${safeJsonStringify((repository ?? {}), null, '\t')}`);
		// eslint-disable-next-line curly
		if(execMode === 'api' && !mergedOptions.quiet) {
			logger?.debug?.(`upstream repository info: ${safeJsonStringify((repository ?? {}), null, '\t')}`);
		}

		// Step 3: Create a repo object
		const ghRepo = client?.repo?.(`${repository?.user}/${repository?.project}`);

		debug(`connecting to: ${repository?.user}/${repository?.project}`);
		// eslint-disable-next-line curly
		if(execMode === 'api' && !mergedOptions.quiet) {
			logger?.debug?.(`connecting to: ${repository?.user}/${repository?.project}`);
		}

		// Step 4: Get all the releases for the repository
		debug(`fetching last release info...`);
		if(execMode === 'api')
			logger?.debug?.(`fetching last release info...`);
		else
			if(logger) logger.text = `fetching last release info...`;

		const ghReleases = await ghRepo?.releasesAsync?.();
		const lastRelease = ghReleases?.[0]?.map?.((release) => {
			return {
				'name': release?.name,
				'published': release?.published_at,
				'tag': release?.tag_name
			};
		})
		?.sort?.((left, right) => {
			return (new Date(right?.published))?.valueOf() - (new Date(left?.published))?.valueOf();
		})
		?.shift?.();

		debug(`fetched last release info.`);
		if(execMode === 'api')
			logger?.info?.(`fetched last release info...`);
		else
			logger?.succeed?.(`Fetched last release info.`);

		// Step 5: Get the last released commit, and the most recent tag / specified tag commit
		debug(`getting tag used for the last release`);
		if(execMode === 'api' && !mergedOptions.quiet)
			logger?.debug?.(`getting tag used for the last release`);
		else
			if(logger) logger.text = `Getting tag used for the last release`;

		let lastReleasedCommit = null;
		if(lastRelease) {
			lastReleasedCommit = await git?.raw?.(['rev-list', '-n', '1', `tags/${lastRelease?.tag}`]);
			lastReleasedCommit = lastReleasedCommit?.replace?.(/\\n/g, '')?.trim?.();
		}

		let lastTag = await git?.tag?.(['--sort=-creatordate']);
		// If a specific tag name is not given, use the commit associated with the last tag
		if(mergedOptions?.tag === '')
			lastTag = lastTag?.split?.('\n')?.shift?.()?.replace?.(/\\n/g, '')?.trim?.();
		// Otherwise, use the commit associated with the specified tag
		else
			lastTag = lastTag?.split?.('\n')?.filter?.((tagName) => { return tagName?.replace?.(/\\n/g, '')?.trim?.() === mergedOptions?.tag; })?.shift()?.replace?.(/\\n/g, '')?.trim();

		let lastCommit = null;
		if(lastTag) {
			lastCommit = await git?.raw?.(['rev-list', '-n', '1', `tags/${lastTag}`]);
			lastCommit = lastCommit?.replace?.(/\\n/g, '')?.trim?.();
		}

		debug(`last release tag: ${lastRelease?.tag}, last release commit sha: ${lastReleasedCommit}, current tag: ${lastTag}, current commit sha: ${lastCommit}`);
		if(execMode === 'api' && !mergedOptions.quiet)
			logger?.debug?.(`last release tag: ${lastRelease?.tag}, last release commit sha: ${lastReleasedCommit}, current tag: ${lastTag}, current commit sha: ${lastCommit}`);
		else
			logger?.succeed?.(`Retrieved tag used for the last release`);

		// Step 6: Get data required for generating the RELEASE NOTES
		debug(`generating release notes...`);
		if(execMode === 'api' && !mergedOptions.quiet)
			logger?.debug?.(`generating release notes`);
		else
			if(logger) logger.text = `Generating release notes...`;

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

		debug(`finished filtering out irrelevant git logs`);
		// eslint-disable-next-line curly
		if(execMode === 'api' && !mergedOptions.quiet) {
			logger?.debug?.(`filtered out irrelevant git logs`);
		}

		const featureSet = [];
		const bugfixSet = [];
		const documentationSet = [];
		const contributorSet = {};

		debug(`fetching author information`);
		// eslint-disable-next-line curly
		if(execMode === 'api' && !mergedOptions.quiet) {
			logger?.debug?.(`fetching author information`);
		}

		let resolutions = [];
		relevantGitLogs?.forEach?.((commitLog) => {
			const commitObject = {
				'hash': commitLog?.hash,
				'component': '',
				'message': commitLog?.message,
				'author_name': commitLog?.['author_name'],
				'author_email': commitLog?.['author_email'],
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

			if(commitObject?.message?.startsWith?.('(')) {
				const componentClose = commitObject?.message?.indexOf?.(':') - 2;
				commitObject.component = commitObject?.message?.substr?.(1, componentClose);

				commitObject.message = commitObject?.message?.substr?.(componentClose + 3);
			}
			else {
				commitObject.message = commitObject?.message?.substr?.(1);
			}

			set?.push?.(commitObject);
			if(!Object.keys(contributorSet)?.includes?.(commitLog?.['author_email'])) {
				contributorSet[commitLog['author_email']] = commitLog?.['author_name'];
				resolutions?.push?.(ghRepo?.commitAsync?.(commitLog?.hash));
			}
		});

		const promises = require('bluebird');
		resolutions = await promises?.all?.(resolutions);

		debug(`fetching author information`);
		// eslint-disable-next-line curly
		if(execMode === 'api' && !mergedOptions.quiet) {
			logger?.debug?.(`fetched author information`);
		}

		// Step 7: Record authors / contributors
		debug(`processing author information`);
		// eslint-disable-next-line curly
		if(execMode === 'api' && !mergedOptions.quiet) {
			logger?.debug?.(`processing author information`);
		}

		const commits = resolutions?.shift?.();
		const authorList = [];
		commits?.forEach?.((ghCommit, idx) => {
			const authorEmail = Object.keys(contributorSet)[idx];
			if(!authorEmail) return;

			authorList?.push?.({
				'name': contributorSet?.[authorEmail],
				'email': authorEmail,
				'profile': ghCommit?.author?.html_url,
				'avatar': ghCommit?.author?.avatar_url
			});
		});

		featureSet?.forEach?.((feature) => {
			const thisAuthor = authorList?.filter?.((author) => { return author?.email === feature?.author_email; })?.shift?.();
			feature['author_profile'] = thisAuthor?.profile;
		});

		bugfixSet?.forEach?.((fix) => {
			const thisAuthor = authorList?.filter?.((author) => { return author?.email === fix?.author_email; })?.shift?.();
			fix['author_profile'] = thisAuthor?.profile;
		});

		documentationSet?.forEach((doc) => {
			const thisAuthor = authorList?.filter?.((author) => { return author?.email === doc?.author_email; })?.shift?.();
			doc['author_profile'] = thisAuthor?.profile;
		});

		const releaseMessageData = {
			'REPO': repository,
			'RELEASE_NAME': mergedOptions?.releaseName,
			'NUM_FEATURES': featureSet?.length,
			'NUM_FIXES': bugfixSet?.length,
			'NUM_DOCS': documentationSet?.length,
			'NUM_AUTHORS': authorList?.length,
			'FEATURES': featureSet,
			'FIXES': bugfixSet,
			'DOCS': documentationSet,
			'AUTHORS': authorList
		};

		// Step 8: EJS the Release Notes template
		let releaseMessagePath = mergedOptions?.releaseMessage ?? '';
		if(releaseMessagePath === '') releaseMessagePath = './../templates/release-notes.ejs';
		if(!path.isAbsolute(releaseMessagePath)) releaseMessagePath = path.join(__dirname, releaseMessagePath);

		// Get package.json into memory...
		const ejs = promises?.promisifyAll?.(require('ejs'));
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
		releaseMessageData['RELEASE_TYPE'] = parsedVersion?.prerelease?.length ? 'pre-release' : 'release';

		const releaseNotes = await ejs?.renderFileAsync?.(releaseMessagePath, releaseMessageData, {
			'async': true,
			'cache': false,
			'debug': false,
			'rmWhitespace': false,
			'strict': false
		});

		debug(`generated release notes`);
		if(execMode === 'api')
			logger?.info?.(`generated release notes`);
		else
			logger?.succeed?.(`Generated release notes.`);

		// Step 9: Create the release...
		debug(`pushing release to https://api.${repository.domain}/repos/${repository.user}/${repository.project}/releases`);
		if(execMode === 'api' && !mergedOptions.quiet)
			logger?.debug?.(`pushing release to https://api.${repository.domain}/repos/${repository.user}/${repository.project}/releases`);
		else
			if(logger) logger.text = `Pushing release to https://api.${repository.domain}/repos/${repository.user}/${repository.project}/releases...`;

		const clientPost = promises?.promisify?.(client?.post?.bind?.(client));

		await clientPost?.(`https://api.${repository.domain}/repos/${repository.user}/${repository.project}/releases`, {
			'accept': 'application/vnd.github.v3+json',
			'tag_name': lastTag,
			'name': releaseMessageData?.['RELEASE_NAME'],
			'body': releaseNotes,
			'prerelease': !!parsedVersion?.prerelease?.length
		});

		debug(`pushed release to https://api.${repository.domain}/repos/${repository.user}/${repository.project}/releases`);
		if(execMode === 'api')
			logger?.info?.(`pushed release to https://api.${repository.domain}/repos/${repository.user}/${repository.project}/releases`);
		else
			logger?.succeed?.(`Pushed release to https://api.${repository.domain}/repos/${repository.user}/${repository.project}/releases.`);
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
		.option('-gt, --github-token <token>', 'Token to use for creating the release on Github', process.env.GITHUB_TOKEN)

		.option('-m, --message', 'Commit message if branch is dirty. Ignored if --commit is not passed in', configuration?.release?.message ?? '')

		.option('--dont-tag', 'Don\'t tag now. Use the last tag when cutting this release', configuration?.release?.dontTag ?? false)
		.option('--tag <name>', 'Use the (existing) tag specified when cutting this release', configuration?.release?.tag?.trim() ?? '')
		.option('-tn, --tag-name <name>', 'Tag Name to use for this release', `V${pkg.version}`)
		.option('-tm, --tag-message <message>', 'Message to use when creating the tag.', `The spaghetti recipe at the time of releasing V${pkg.version}`)

		.option('--dont-release', 'Don\'t release now. Simply tag and exit', configuration?.release?.dontRelease ?? false)
		.option('-rn, --release-name <name>', 'Name to use for this release', `V${pkg.version} Release`)
		.option('-rm, --release-message <path to release notes EJS>', 'Path to EJS file containing the release message/notes, with/without a placeholder for auto-generated metrics', configuration?.release?.releaseMessage ?? '')

		.option('-u, --upstream <remote>', 'Git remote to use for creating the release', configuration?.release?.upstream ?? 'upstream')
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
