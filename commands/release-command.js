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
 * @param		{object} logger - The logger instance
 *
 * @description
 * The command class that implements the "release" step of the workflow.
 * Please see README.md for the details of what this step involves.
 *
 */
class ReleaseCommandClass {
	// #region Constructor
	constructor(configuration, logger) {
		Object.defineProperty(this, '_commandOptions', {
			'writeable': true,
			'value': configuration ?? {}
		});

		Object.defineProperty(this, '_logger', {
			'writeable': true,
			'value': logger ?? console
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
	 * @param    {object} logger - Object implementing the usual log commands (debug, info, warn, error, etc.)
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
	async execute(options, logger) {
		const es6DynTmpl = require('es6-dynamic-template');
		const path = require('path');
		const safeJsonStringify = require('safe-json-stringify');
		const simpleGit = require('simple-git');

		let shouldPopOnError = false;

		// Get package.json into memory... we'll use it in multiple places here
		const projectPackageJson = path.join(process.cwd(), 'package.json');
		const pkg = require(projectPackageJson);

		// Setup sane defaults for the options
		const mergedOptions = {};
		mergedOptions.debug = options?.debug ?? (options?.parent?.debug ?? false);
		mergedOptions.silent = options?.silent ?? (options?.parent?.silent ?? false);
		mergedOptions.quiet = options?.quiet ?? (options?.parent?.quiet ?? false);

		mergedOptions.quiet = mergedOptions.quiet || mergedOptions.silent;

		mergedOptions.commit = options?.commit ?? (this?._commandOptions?.commit ?? false);
		mergedOptions.githubToken = options?.githubToken ?? (this?._commandOptions?.githubToken ?? process.env.GITHUB_TOKEN);
		mergedOptions.message = options?.message ?? (this?._commandOptions?.message ?? '');
		mergedOptions.releaseNote = options?.releaseNote ?? (this?._commandOptions.releaseNote ?? '');
		mergedOptions.tagName = options?.tagName ?? (this?._commandOptions.tagName ?? `V${pkg.version}`);
		mergedOptions.tagMessage = options?.tagMessage ?? (this?._commandOptions.tagMessage ?? `The spaghetti recipe at the time of releasing V${pkg.version}`);
		mergedOptions.upstream = options?.upstream ?? (this?._commandOptions.upstream ?? 'upstream');

		// Setting up the logs, according to the options passed in
		if(mergedOptions.debug) debugLib.enable('announce:*');
		let loggerFn = null;
		if(!mergedOptions.silent) { // eslint-disable-line curly
			if(mergedOptions.quiet) {
				loggerFn = logger?.info?.bind?.(logger) ?? this._logger?.info?.bind(this._logger);
				loggerFn = loggerFn ?? console.info.bind(console);
			}
			else {
				loggerFn = logger?.debug?.bind?.(logger) ?? this._logger?.debug?.bind(this._logger);
				loggerFn = loggerFn ?? console.debug.bind(console);
			}
		}

		debug(`Releasing with options: ${safeJsonStringify(mergedOptions, null, '\t')}`);

		// Step 1: Initialize the GIT API for the current working directory
		const git = simpleGit({
			'baseDir': process.cwd()
		})
		.outputHandler((_command, stdout, stderr) => {
			if(mergedOptions.debug) stdout.pipe(process.stdout);
			stderr.pipe(process.stderr);
		});

		debug(`Initialized Git for the repository @ ${process.cwd()}`);

		try {
			// Step 2: Generate git commit trailer messages... we'll use this in multiple places, as well
			let trailerMessages = await git.raw('interpret-trailers', path.join(__dirname, '../.gitkeep'));
			trailerMessages = trailerMessages.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
			debug(`Trailer messages: ${trailerMessages}`);

			// Step 3: Check if branch is dirty...
			const branchStatus = await git.status();

			// Step 4: Stash / Commit as required
			let stashOrCommitStatus = null;
			if(branchStatus.files.length) {
				debug(`Branch is dirty. Starting ${mergedOptions.commit ? 'commit' : 'stash'} process`);
				loggerFn?.(`Branch is dirty. Starting ${mergedOptions.commit ? 'commit' : 'stash'} process`);

				if(!mergedOptions.commit) {
					stashOrCommitStatus = await git.stash(['push']);
					shouldPopOnError = true;
				}
				else {
					const commitMessage = es6DynTmpl(mergedOptions.message, pkg);
					debug(`Commit message: ${commitMessage}`);

					const consolidatedMessage = commitMessage + trailerMessages;
					stashOrCommitStatus = await git.commit(consolidatedMessage, null, {
						'--all': true,
						'--allow-empty': true,
						'--signoff': true
					});

					stashOrCommitStatus = stashOrCommitStatus.commit;
				}
			}

			debug(`${mergedOptions.commit ? 'Commit' : 'Stash'} status: ${safeJsonStringify(stashOrCommitStatus, null, '\t')}`);
			loggerFn?.(`Done with the ${mergedOptions.commit ? 'commit' : 'stash'}`);

			// Step 5: Get the last tag, the commit related to it, and the current commit
			let lastTag = await git.tag(['--sort=-creatordate']);
			lastTag = lastTag.split('\\n').shift().replace(/\\n/g, '').trim();

			let lastTaggedCommit = await git.raw(['rev-list', '-n', '1', `tags/${lastTag}`]);
			lastTaggedCommit = lastTaggedCommit.replace(/\\n/g, '').trim();

			let lastCommit = await git.raw(['rev-parse', 'HEAD']);
			lastCommit = lastCommit.replace(/\\n/g, '').trim();

			debug(`Last Tag: ${lastTag}, commit sha: ${lastTaggedCommit}, current commit sha: ${lastCommit}`);
			loggerFn?.(`Generating CHANGELOG now...`);

			// Step 6: Generate the CHANGELOG using the commit messages in the git log - from the last tag to the most recent commit
			let gitLogsInRange = await git.log(lastTaggedCommit, lastCommit);
			gitLogsInRange = gitLogsInRange.all.filter((commitLog) => {
				return commitLog.message.startsWith('feat') || commitLog.message.startsWith('fix') || commitLog.message.startsWith('docs');
			});

			let gitRemotes = await git.raw(['remote', '-v']);
			gitRemotes = gitRemotes.split('\n').filter((remote) => {
				return remote.startsWith(mergedOptions.upstream);
			})[0];

			gitRemotes = gitRemotes.replace(`${mergedOptions.upstream}\t`, '').replace('git@github.com:', 'github.com/').replace('https://', '');
			const extnIdx = gitRemotes.indexOf('.git');

			const repository = gitRemotes.substring(0, extnIdx);

			const changeLogText = [`#### CHANGE LOG`];
			const processedDates = [];

			const dateFormat = require('date-fns/format');
			gitLogsInRange.forEach((commitLog) => {
				const commitDate = dateFormat(new Date(commitLog.date), 'dd-MMM-yyyy');
				if(!processedDates.includes(commitDate)) {
					processedDates.push(commitDate);
					changeLogText.push(`\n\n##### ${commitDate}`);
				}

				changeLogText.push(`\n${commitLog.message} ([${commitLog.hash}](https://${repository}/commit/${commitLog.hash}))`);
			});

			const replaceInFile = require('replace-in-file');
			const replaceOptions = {
				'files': path.join(process.cwd(), 'CHANGELOG.md'),
				'from': '#### CHANGE LOG',
				'to': changeLogText.join('\n')
			};

			const changelogResult = await replaceInFile(replaceOptions);
			if(!changelogResult[0]['hasChanged']) {
				const prependFile = require('prepend-file');
				await prependFile(path.join(process.cwd(), 'CHANGELOG.md'), changeLogText.join('\n'));
			}

			debug(`Generated CHANGELOG`);
			loggerFn?.(`Generated CHANGELOG`);

			// Step 7: Commit CHANGELOG
			const consolidatedMessage = `docs(CHANGELOG): generated change log for release ${pkg.version}\n${trailerMessages}`;
			let tagCommitSha = await git.commit(consolidatedMessage, null, {
				'--allow-empty': true,
				'--no-verify': true
			});
			tagCommitSha = tagCommitSha.commit;

			debug(`Committed change log: ${tagCommitSha}`);
			loggerFn?.(`Committed CHANGELOG`);

			// Step 8: Tag this commit
			const tagName = es6DynTmpl(mergedOptions.tagName, pkg);
			const tagMessage = es6DynTmpl(mergedOptions.tagMessage, pkg);

			const tagStatus = await git.tag(['-a', '-f', '-m', tagMessage, tagName, tagCommitSha]);
			debug(`Tag ${tagName}: ${tagMessage} done with status: ${safeJsonStringify(tagStatus, null, '\t')}`);
			loggerFn?.(`Tag ${tagName}: ${tagMessage} done with status: ${safeJsonStringify(tagStatus, null, '\t')}`);

			// Step 9: Push commit/tag to the specified upstream
			const pushCommitStatus = await git.push(mergedOptions.upstream, branchStatus.current, {
				'--atomic': true,
				'--progress': true,
				'--signed': 'if-asked'
			});

			const pushTagStatus = await git.pushTags(mergedOptions.upstream, {
				'--atomic': true,
				'--force': true,
				'--progress': true,
				'--signed': 'if-asked'
			});

			debug(`Pushed to ${mergedOptions.upstream}:\nCommit: ${safeJsonStringify(pushCommitStatus, null, '\t')}\nTag: ${safeJsonStringify(pushTagStatus, null, '\t')}`);

			loggerFn?.(`Done releasing the code to ${mergedOptions.upstream}`);
			debug(`done releasing the code to ${mergedOptions.upstream}`);
		}
		// Finally, pop stash if necessary
		finally {
			if(shouldPopOnError) {
				debug(`Restoring code - popping the stash`);
				loggerFn?.(`Restoring code - popping the stash`);

				await git.stash(['pop']);
			}
		}
	}
	// #endregion

	// #region Private Fields
	// #endregion
}

// Add the command to the cli
let commandObj = null;
exports.commandCreator = function commandCreator(commanderProcess, configuration) {
	if(!commandObj) commandObj = new ReleaseCommandClass(configuration?.release, console);

	// Get package.json into memory... we'll use it in multiple places here
	const path = require('path');
	const projectPackageJson = path.join(process.cwd(), 'package.json');
	const pkg = require(projectPackageJson);

	commanderProcess
		.command('release')
		.option('-c, --commit', 'Commit code if branch is dirty', configuration?.release?.commit ?? false)
		.option('-gt, --github-token <token>', 'Token to use for creating the release on Github')
		.option('-m, --message', 'Commit message if branch is dirty. Ignored if --commit is not passed in', configuration?.release?.message ?? '')
		.option('-rn, --release-note <path to release notes markdown>', 'Path to markdown file containing the release notes, with/without a placeholder for the CHANGELOG', configuration?.release?.releaseNote ?? '')
		.option('-tn, --tag-name <name>', 'Tag Name to use for this release', `V${pkg.version}`)
		.option('-tm, --tag-message <message>', 'Message to use when creating the tag.', `The spaghetti recipe at the time of releasing V${pkg.version}`)
		.option('-u, --upstream <remote>', 'Git remote to use for creating the release', configuration?.release?.upstream ?? 'upstream')
		.action(commandObj.execute.bind(commandObj));

	return;
};

// Export the API for usage by downstream programs
exports.apiCreator = function apiCreator() {
	if(!commandObj) commandObj = new ReleaseCommandClass();
	return {
		'name': 'release',
		'method': commandObj.execute.bind(commandObj)
	};
};
