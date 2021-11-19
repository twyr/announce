/* eslint-disable curly */
/* eslint-disable security/detect-object-injection */
/* eslint-disable security-node/detect-non-literal-require-calls */
/* eslint-disable security/detect-non-literal-require */
'use strict';

/**
 * Module dependencies, required for ALL Twy'r modules
 * @ignore
 */

/**
 * Module dependencies, required for this module
 * @ignore
 */

/**
 * @class		ReleaseCommandClass
 * @classdesc	The command class that creates a release on a git host (Github / GitLab / BitBucket / etc.).
 *
 * @param		{object} mode - Set the current run mode - CLI or API
 *
 * @description
 * The command class that implements the "release" step of the workflow.
 * Please see README.md for the details of what this step involves.
 *
 */
class ReleaseCommandClass {
	// #region Constructor
	constructor(mode) {
		this.#execMode = mode?.execMode;
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
	 * @param    {object} configOptions - Options via cosmiConfig, or via API
	 * @param    {object} cliOptions - Options via the CLI
	 *
	 * @return   {null} Nothing.
	 *
	 * @summary  The main method to tag/release the codebase on Github / GitLab / etc.
	 *
	 * This method does 3 things:
	 * - Generates the changelog - features/fixes added to the code since the last tag/release
	 * - Commits, tags, pushes to Github / GitLab / etc.
	 * - Creates a release using the tag and the generated changelog
	 *
	 */
	async execute(configOptions, cliOptions) {
		// Step 1: Setup sane defaults for the options
		const mergedOptions = this?._mergeOptions?.(configOptions, cliOptions);

		// Step 2: Set up the logger according to the options passed in
		const logger = this?._setupLogger?.(mergedOptions);
		mergedOptions.logger = logger;

		// Step 3: Setup the task list
		const taskList = this?._setupTasks?.();

		// Step 4: Run the tasks in sequence
		// eslint-disable-next-line security-node/detect-crlf
		console.log(`Releasing the codebase:`);
		await taskList?.run?.({
			'options': mergedOptions,
			'execError': null
		});
	}
	// #endregion

	// #region Private Methods
	/**
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_mergeOptions
	 *
	 * @param		{object} configOptions - Options passed in from cosmiConfig / calling module
	 * @param		{object} cliOptions - Options passed in from the CLI
	 *
	 * @return		{object} Merged options - input options > configured options.
	 *
	 * @summary  	Merges options passed in with configured ones - and puts in sane defaults if neither is available.
	 *
	 */
	_mergeOptions(configOptions, cliOptions) {
		const path = require('path');
		const mergedOptions = Object?.assign?.({}, configOptions, cliOptions);

		// Process upstreams
		mergedOptions.upstream = mergedOptions?.upstream
			?.split?.(',')
			?.map?.((remote) => { return remote?.trim?.(); })
			?.filter?.((remote) => { return !!remote.length; });

		// Process release notes storage output formats
		mergedOptions.outputFormat = mergedOptions?.outputFormat
			?.split?.(',')
			?.map?.((format) => { return format?.trim?.(); })
			?.filter?.((format) => { return !!format.length; });

		if(mergedOptions?.outputFormat?.includes?.('all'))
			mergedOptions.outputFormat = ['json', 'pdf'];

		// Process release notes storage path
		let outputPath = mergedOptions?.outputPath?.trim?.() ?? '';
		if(outputPath === '') outputPath = './buildresults/release-notes';
		if(!path.isAbsolute(outputPath)) outputPath = path.join(mergedOptions?.currentWorkingDirectory, outputPath);

		mergedOptions.outputPath = outputPath;

		// Process release notes ejs template path
		let releaseMessagePath = mergedOptions?.releaseMessage ?? '';
		if(releaseMessagePath === '') releaseMessagePath = './templates/release-notes.ejs';
		if(!path.isAbsolute(releaseMessagePath)) releaseMessagePath = path.join(mergedOptions?.currentWorkingDirectory, releaseMessagePath);

		mergedOptions.releaseMessage = releaseMessagePath;

		// Process old tag name
		mergedOptions.useTag = mergedOptions?.useTag?.trim?.();
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
	 * @summary  	Logger for API mode, otherwise null
	 *
	 */
	_setupLogger(options) {
		if(this.#execMode === 'api')
			return options?.logger;

		return null;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_setupTasks
	 *
	 * @return		{object} Tasks as Listr.
	 *
	 * @summary  	Setup the list of tasks to be run
	 *
	 */
	_setupTasks() {
		const Listr = require('listr');
		const taskList = new Listr([{
			'title': 'Initializing Git Client...',
			'task': this?._initializeGit?.bind?.(this)
		}, {
			'title': 'Stash / Commit...',
			'task': this?._stashOrCommit?.bind?.(this),
			'skip': (ctxt) => {
				if(ctxt?.options?.git)
					return false;

				return `No Git client found.`;
			}
		}, {
			'title': 'Generating Changelog...',
			'task': this?._generateChangelog?.bind?.(this),
			'skip': (ctxt) => {
				if(ctxt?.execError) return `Error in previous step`;
				if(!ctxt?.options?.tag) return `--no-tag option specified.`;
				if(ctxt?.options?.useTag?.length) return `Using previous tag ${ctxt?.options?.useTag}`;
				if(!ctxt?.options?.git) return `No Git client found.`;

				return false;
			}
		}, {
			'title': 'Tagging the commit...',
			'task': this?._tagCode?.bind?.(this),
			'skip': (ctxt) => {
				if(ctxt?.execError) return `Error in one of the previous steps`;
				if(!ctxt?.options?.git) return `No Git client found.`;
				if(!ctxt?.options?.createTag) return `No changelog generated, so nothing to tag`;
				if(!ctxt?.options?.tag) return `--no-tag option specified.`;
				if(ctxt?.options?.useTag?.length) return `Using previous tag ${ctxt?.options?.useTag}`;

				return false;
			}
		}, {
			'title': 'Pushing upstream...',
			'task': this?._pushUpstream?.bind?.(this),
			'skip': (ctxt) => {
				if(ctxt?.execError) return `Error in one of the previous steps`;
				if(!ctxt?.options?.git) return `No Git client found.`;
				if(!ctxt?.options?.tag) return `--no-tag option specified.`;
				if(ctxt?.options?.upstream?.length < 1) return `No upstreams specified`;
				if(ctxt?.options?.useTag?.length) return `Using previous tag ${ctxt?.options?.useTag}`;

				return false;
			}
		}, {
			'title': 'Generating Release...',
			'task': this?._generateRelease?.bind?.(this),
			'skip': (ctxt) => {
				if(ctxt?.execError) return `Error in previous step`;
				if(!ctxt?.options?.git) return `No Git client found.`;
				if(!ctxt?.options?.release) return `--no-release option specified.`;

				return false;
			}
		}, {
			'title': 'Restoring code...',
			'task': this?._restoreCode?.bind?.(this),
			'enabled': (ctxt) => {
				return ctxt?.options?.shouldPop;
			},
			'skip': (ctxt) => {
				if(ctxt?.options?.git)
					return false;

				return `No Git client found.`;
			}
		}, {
			'title': 'Summarizing...',
			'task': this?._summarize?.bind?.(this)
		}], {
			'collapse': false
		});

		return taskList;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_initializeGit
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Creates a Git client instance for the current project repository and sets it on the context.
	 *
	 */
	_initializeGit(ctxt, task) {
		const simpleGit = require('simple-git');
		const git = simpleGit?.({
			'baseDir': ctxt?.options?.currentWorkingDirectory
		});

		ctxt?.options?.logger?.info?.(`Initialized Git for the repository @ ${ctxt?.options?.currentWorkingDirectory}`);
		task.title = `Initialize Git for the repository @ ${ctxt?.options?.currentWorkingDirectory}: Done`;

		ctxt.options.git = git;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_stashOrCommit
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Depending on the configuration, stashes/commits code in the current branch - if required.
	 *
	 */
	async _stashOrCommit(ctxt, task) {
		try {
			const gitOperation = ctxt?.options?.commit ? 'commit' : 'stash';
			const branchStatus = await ctxt?.options?.git?.status?.();

			if(!branchStatus?.files?.length) {
				ctxt?.options?.logger?.info?.(`${branchStatus.current} branch clean - ${gitOperation} operation not required.`);
				task.title = `${gitOperation} operation not required.`;
				return;
			}

			ctxt?.options?.logger?.debug?.(`${branchStatus.current} branch dirty - proceeding with ${gitOperation} operation`);
			task.title = `${gitOperation} in progress...`;

			if(gitOperation === 'stash') {
				await ctxt?.options?.git?.stash?.(['push']);
				ctxt.options.shouldPop = true;
			}
			else {
				const path = require('path');

				let trailerMessages = await ctxt?.options?.git?.raw?.('interpret-trailers', path.join(__dirname, '../.gitkeep'));
				trailerMessages = trailerMessages?.replace?.(/\\n/g, '\n')?.replace(/\\t/g, '\t');

				const consolidatedMessage = `${(ctxt?.options?.commitMessage ?? '')} ${(trailerMessages ?? '')}`;
				await ctxt?.options?.git?.commit?.(consolidatedMessage, null, {
					'--all': true,
					'--allow-empty': true,
					'--signoff': true
				});
			}

			ctxt?.options?.logger?.info?.(`"${branchStatus.current}" branch ${gitOperation} done`);
			task.title = `"${branchStatus.current}" branch ${gitOperation}: Done.`;
		}
		catch(err) {
			task.title = 'Stash / Commit: Error';
			ctxt.execError = err;
		}
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_generateChangelog
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Generates a CHANGELOG from the relevant Git Log events, and commits the modified file.
	 *
	 */
	async _generateChangelog(ctxt, task) {
		ctxt?.options?.logger?.info?.(`Generating CHANGELOG containing significant Git log events from the last tag onwards`);

		const Listr = require('listr');
		const taskList = new Listr([{
			'title': 'Fetching git log events...',
			'task': this?._fetchGitLogsForChangelog?.bind?.(this)
		}, {
			'title': 'Filtering git log events...',
			'task': this?._filterGitLogs?.bind?.(this),
			'skip': () => {
				if(ctxt?.execError) return `Error in one of the previous steps`;
				if(ctxt?.options?.gitLogsInRange?.all?.length)
					return false;

				return `No relevant git logs.`;
			}
		}, {
			'title': 'Formatting git log events...',
			'task': this?._formatGitLogsForChangelog?.bind?.(this),
			'skip': () => {
				if(ctxt?.execError) return `Error in one of the previous steps`;
				if(ctxt?.options?.gitLogsInRange?.all?.length)
					return false;

				return `No relevant git logs.`;
			}
		}, {
			'title': 'Creating / Modifying changelog...',
			'task': this?._modifyChangelog?.bind?.(this),
			'skip': () => {
				if(ctxt?.execError) return `Error in one of the previous steps`;
				if(ctxt?.options?.changelogText && ctxt?.options?.changelogText?.trim?.()?.length)
					return false;

				return `No change log to add.`;
			}
		}, {
			'title': 'Commiting changelog...',
			'task': this?._commitChangelog?.bind?.(this),
			'skip': async () => {
				if(ctxt?.execError) return `Error in one of the previous steps`;

				const git = ctxt?.options?.git;

				const branchStatus = await git?.status?.();
				if(branchStatus?.files?.length) return false;

				ctxt.options.createTag = false;
				return `Nothing to commit.`;
			}
		}, {
			'title': 'Cleaning up...',
			'task': this?._cleanupChangelog?.bind?.(this)
		}, {
			'title': 'Teardown...',
			'task': (thisCtxt, thisTask) => {
				thisTask.title = 'Teardown: Done';
				task.title = ctxt?.execError ? `Changelog Generation: Error` : `Changelog Generation: Done`;
			}
		}], {
			'collapse': true
		});

		return taskList;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_tagCode
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary		Tags the codebase.
	 *
	 */
	async _tagCode(ctxt, task) {
		try {
			ctxt?.options?.logger?.info(`Tagging commit with the CHANGELOG`);

			const git = ctxt?.options?.git;
			let lastCommit = await git?.raw?.(['rev-parse', 'HEAD']);
			lastCommit = lastCommit?.replace?.(/\\n/g, '')?.trim?.();

			if(!lastCommit) {
				task.title = 'Tag the commit: No commits found';
				return;
			}

			await git?.tag?.(['-a', '-f', '-m', ctxt?.options?.tagMessage, ctxt?.options?.tagName, lastCommit]);
			task.title = 'Tag the commit: Done';
		}
		catch(err) {
			task.title = 'Tag the commit: Error';
			ctxt.execError = err;
		}
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_pushUpstream
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary		Pushes new commits/tags to the configured upstream git remote.
	 *
	 */
	async _pushUpstream(ctxt, task) {
		try {
			ctxt?.options?.logger?.info?.(`Pushing commits and tag upstream`);

			const git = ctxt?.options?.git;
			const upstreamRemoteList = ctxt?.options?.upstream;

			task.title = 'Pushing upstream: Pulling from configured upstreams...';
			await git?.remote?.(['update', '-p']?.concat?.(upstreamRemoteList));

			const branchStatus = await git?.status?.();
			for(let idx = 0; idx < upstreamRemoteList.length; idx++) {
				const thisUpstreamRemote = upstreamRemoteList[idx];

				let canPush = await git?.raw?.(['rev-list', `HEAD...${thisUpstreamRemote}/${branchStatus?.current}`, '--ignore-submodules', '--count']);
				canPush = Number(canPush.replace(`\n`, ''));
				if(!canPush) continue;

				task.title = `Pushing upstream: Pushing to ${thisUpstreamRemote}...`;
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

			task.title = 'Push upstream: Done';
		}
		catch(err) {
			task.title = 'Push Upstream: Error';
			ctxt.execError = err;
		}
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_generateRelease
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary		Creates releases for each of the configured upstreams.
	 *
	 */
	async _generateRelease(ctxt, task) {
		try {
			ctxt?.options?.logger?.info?.(`Generating ${ctxt?.options?.upstream?.length > 1 ? 'Releases' : 'Release'} for ${ctxt?.options?.upstream?.join?.(', ')}`);

			const releaseSteps = [{
				'title': `Fetching git logs for release...`,
				'task': this?._fetchGitLogsForRelease?.bind?.(this),
				'skip': (subTaskCtxt) => {
					if(subTaskCtxt?.releaseError) return `Error in one of the previous steps`;
					return false;
				}
			}, {
				'title': 'Filtering git log events...',
				'task': this?._filterGitLogs?.bind?.(this),
				'skip': (subTaskCtxt) => {
					if(subTaskCtxt?.releaseError) return `Error in one of the previous steps`;
					if(ctxt?.options?.gitLogsInRange?.all?.length)
						return false;

					return `No relevant git logs.`;
				}
			}, {
				'title': `Fetching author information for the relevant git log events...`,
				'task': this?._fetchAuthorInformationForRelease?.bind?.(this),
				'skip': (subTaskCtxt) => {
					if(subTaskCtxt?.releaseError) return `Error in one of the previous steps`;
					if(ctxt?.options?.gitLogsInRange?.length)
						return false;

					return `No relevant git logs.`;
				}
			}, {
				'title': `Generating release notes...`,
				'task': this?._generateReleaseNotes?.bind(this),
				'skip': (subTaskCtxt) => {
					if(subTaskCtxt?.releaseError) return `Error in one of the previous steps`;
					if(ctxt?.options?.gitLogsInRange?.length)
						return false;

					if(ctxt?.options?.authorProfiles?.length)
						return false;

					return `No relevant git logs, or no information about their authors.`;
				}
			}, {
				'title': `Pushing release...`,
				'task': this?._createRelease?.bind?.(this),
				'skip': (subTaskCtxt) => {
					if(subTaskCtxt?.releaseError) return `Error in one of the previous steps`;
					if(!ctxt?.options?.releaseData?.['RELEASE_NOTES']) return `Release notes not generated`;

					return false;
				}
			}, {
				'title': `Storing release notes...`,
				'task': this?._storeReleaseNotes?.bind?.(this),
				'skip': (subTaskCtxt) => {
					if(subTaskCtxt?.releaseError) return `Error in one of the previous steps`;
					if(!ctxt?.options?.releaseData?.['RELEASE_NOTES']) return `Release notes not generated`;

					return false;
				}
			}];

			const Listr = require('listr');
			if(ctxt?.options?.upstream?.length > 1) {
				const taskArray = [];

				ctxt?.options?.upstream?.forEach?.((upstream) => {
					taskArray?.push?.({
						'title': `Releasing on ${upstream}...`,
						'task': (thisCtxt, thisTask) => {
							const thisReleaseSteps = [{
								'title': `Setting up...`,
								'task': (subTaskCtxt, subTaskTask) => {
									subTaskCtxt.options.currentReleaseUpstream = `${upstream}`;
									subTaskTask.title = `Setup: Done`;
								}
							}].concat(releaseSteps);

							thisReleaseSteps?.push?.({
								'title': `Cleaning up...`,
								'task': (subTaskCtxt, subTaskTask) => {
									ctxt.execError = subTaskCtxt?.releaseError;

									ctxt.options.gitLogsInRange = null;
									ctxt.options.authorProfiles = null;
									ctxt.options.releaseData = null;

									subTaskTask.title = `Clean up: Done`;
									thisTask.title = ctxt?.execError ? `${upstream} release: Error` : `${upstream} release: Done`;
								}
							});

							return new Listr(thisReleaseSteps, {
								'collapse': true
							});
						},
						'skip': () => {
							if(ctxt?.execError) return `Error in one of the previous steps`;
							return false;
						}
					});
				});

				taskArray?.push?.({
					'title': `Teardown...`,
					'task': (thisCtxt, thisTask) => {
						thisTask.title = `Teardown: Done`;
						task.title = ctxt?.execError ? `Generate Release: Error` : `Generate Release: Done`;
					}
				});

				const taskList = new Listr(taskArray);
				return taskList;
			}
			else {
				const thisReleaseSteps = [{
					'title': `Setting up...`,
					'task': (subTaskCtxt, subTaskTask) => {
						subTaskCtxt.options.currentReleaseUpstream = `${ctxt?.options?.upstream?.[0]}`;
						subTaskTask.title = `Setup: Done`;
					}
				}].concat(releaseSteps);

				thisReleaseSteps?.push?.({
					'title': `Cleaning up...`,
					'task': (subTaskCtxt, subTaskTask) => {
						ctxt.execError = subTaskCtxt?.releaseError;

						ctxt.options.gitLogsInRange = null;
						ctxt.options.authorProfiles = null;
						ctxt.options.releaseData = null;

						subTaskTask.title = `Clean up: Done`;
					}
				});

				return new Listr(thisReleaseSteps, {
					'collapse': true
				});
			}
		}
		catch(err) {
			task.title = 'Generate Release: Error';
			ctxt.execError = err;
		}

		return null;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_restoreCode
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	If code was stashed earlier in the cycle, pops it out.
	 *
	 */
	async _restoreCode(ctxt, task) {
		await ctxt?.options?.git?.stash?.(['pop']);
		task.title = 'Restore code: Done.';
		return;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	ReleaseCommandClass
	 * @name		_summarize
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Print success if everything went through, else print error information.
	 *
	 */
	async _summarize(ctxt, task) {
		if(this.#execMode !== 'cli') {
			if(ctxt?.execError)
				ctxt?.options?.logger?.error?.(ctxt?.execError);
			else
				ctxt?.options?.logger?.info?.(`Release: Done`);

			return;
		}

		if(!ctxt?.execError) {
			task.title = `Release: Done!`;
			return;
		}

		task.title = `Release process had errors:`;
		setTimeout?.(() => {
			console?.error?.(`\n      Message:${ctxt?.execError?.message}\n      Stack:${ctxt?.execError?.stack?.replace(/\\n/g, `\n      `)}\n\n`);
		}, 1000);
	}
	// #endregion

	// #region Git Log processing methods
	async _fetchGitLogs(git, from, to) {
		let gitLogsInRange = null;

		if(from && to)
			gitLogsInRange = await git?.log?.({
				'from': from,
				'to': to
			});

		if(!from && to)
			gitLogsInRange = await git?.log?.({
				'to': to
			});

		if(from && !to)
			gitLogsInRange = await git?.log?.({
				'from': from
			});

		if(!from && !to)
			gitLogsInRange = {
				'all': []
			};

		return gitLogsInRange;
	}

	async _filterGitLogs(ctxt, task) {
		try {
			const gitLogsInRange = ctxt?.options?.gitLogsInRange;
			const relevantGitLogs = [];

			gitLogsInRange?.all?.forEach?.((commitLog) => {
				if(commitLog?.message?.startsWith?.('feat(') ||
					commitLog?.message?.startsWith?.('feat:') ||
					commitLog?.message?.startsWith?.('fix(') ||
					commitLog?.message?.startsWith?.('fix:') ||
					commitLog?.message?.startsWith?.('docs(') ||
					commitLog?.message?.startsWith?.('docs:')
				) {
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
					if(commitBody?.startsWith?.('feat(') ||
						commitBody?.startsWith?.('feat:') ||
						commitBody?.startsWith?.('fix(') ||
						commitBody?.startsWith?.('fix:') ||
						commitBody?.startsWith?.('docs(') ||
						commitBody?.startsWith?.('docs:')
					) {
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

			ctxt.options.gitLogsInRange = relevantGitLogs;
			task.title = 'Filter git log events: Done';
		}
		catch(err) {
			ctxt.options.gitLogsInRange = [];
			task.title = 'Filter git log events: Error';

			ctxt.execError = err;
		}
	}
	// #endregion

	// #region Changelog generation methods
	async _fetchGitLogsForChangelog(ctxt, task) {
		try {
			const git = ctxt?.options?.git;

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
			ctxt.options.gitLogsInRange = await this?._fetchGitLogs?.(git, lastTaggedCommit, lastCommit);
			task.title = 'Fetch git log events: Done';
		}
		catch(err) {
			ctxt.options.gitLogsInRange = null;
			task.title = 'Fetch git log events: Error';

			ctxt.execError = err;
		}
	}

	async _formatGitLogsForChangelog(ctxt, task) {
		try {
			const git = ctxt?.options?.git;
			const relevantGitLogs = ctxt?.options?.gitLogsInRange;

			// Step 1: Get the upstream to use...
			const upstreamRemoteList = ctxt?.options?.upstream;
			const upstreamForLinks = upstreamRemoteList?.shift?.();

			// Step 2: Get the upstream type...
			const hostedGitInfo = require('hosted-git-info');
			const gitRemote = await git?.remote?.(['get-url', '--push', upstreamForLinks]);
			const repository = hostedGitInfo?.fromUrl?.(gitRemote);
			repository.project = repository?.project?.replace?.('.git\n', '');

			// Step 3: Instantiate the relevant Git Host Wrapper
			const GitHostWrapper = require(`./../git_host_utilities/${repository.type}`).GitHostWrapper;
			const gitHostWrapper = new GitHostWrapper(ctxt?.options?.githubToken);

			// Step 4: Convert the relevant Git Logs into a textual array, and add links to the hosted commit hash for insertion into the file
			const changeLogText = [`#### CHANGE LOG`];
			const processedDates = [];

			const dateFormat = require('date-fns/format');
			relevantGitLogs?.forEach?.((commitLog) => {
				const commitDate = dateFormat?.(new Date(commitLog?.date), 'dd-MMM-yyyy');
				if(!processedDates?.includes?.(commitDate)) {
					processedDates?.push?.(commitDate);
					changeLogText?.push?.(`\n\n##### ${commitDate}`);
				}

				const commitLink = gitHostWrapper?.getCommitLink?.(repository, commitLog);
				changeLogText?.push?.(`\n${commitLog?.message} ([${commitLog?.hash}](${commitLink})`);
			});

			ctxt.options.changelogText = changeLogText;
			task.title = 'Format git log events: Done';
		}
		catch(err) {
			ctxt.options.changelogText = null;
			task.title = 'Format git log events: Error';

			ctxt.execError = err;
		}
	}

	async _modifyChangelog(ctxt, task) {
		const path = require('path');
		const prependFile = require('prepend-file');
		const replaceInFile = require('replace-in-file');

		try {
			const changeLogText = ctxt?.options?.changelogText;
			while(changeLogText?.length) {
				const thisChangeSet = [];

				// Step 1: Get all Git Logs for a particular date
				let thisChangeLog = changeLogText?.pop?.();
				while(changeLogText?.length && !thisChangeLog?.startsWith?.(`\n\n####`)) {
					thisChangeSet?.unshift?.(thisChangeLog);
					thisChangeLog = changeLogText?.pop?.();
				}

				thisChangeSet?.unshift?.(thisChangeLog);

				// Step 2: Add to existing entries for that date, if any already present in the file
				const replaceOptions = {
					'files': path?.join?.(ctxt?.options?.currentWorkingDirectory, 'CHANGELOG.md'),
					'from': thisChangeLog,
					'to': thisChangeSet?.join?.(`\n`)
				};

				// If the file has changed, continue to start processing the next date entries
				let changelogResult = await replaceInFile?.(replaceOptions);
				if(changelogResult?.[0]?.['hasChanged'])
					continue;

				// File hasn't changed, and there are no more relevant Git Logs. Break
				if(!changeLogText?.length)
					continue;

				// Step 3: File hasn't changed, but there are relevant Git Logs? That date is new
				// So simply add everything remaining to the top of the CHANGELOG
				while(thisChangeSet?.length) changeLogText?.push?.(thisChangeSet?.shift?.());
				replaceOptions['from'] = changeLogText?.[0];
				replaceOptions['to'] = `${changeLogText?.join?.('\n')}\n`;

				changelogResult = await replaceInFile?.(replaceOptions);
				if(changelogResult?.[0]?.['hasChanged'])
					break;

				// Step 4: The last resort... simply prepend everything
				// This should happen only if the CHANGELOG.md file is absolutely empty
				await prependFile?.(path.join(ctxt?.options?.currentWorkingDirectory, 'CHANGELOG.md'), `${changeLogText?.join?.('\n')}\n`);
				break;
			}

			task.title = 'Create / Modify changelog: Done';
		}
		catch(err) {
			task.title = 'Create / Modify changelog: Error';
			ctxt.execError = err;
		}
	}

	async _commitChangelog(ctxt, task) {
		try {
			const path = require('path');
			const projectPackageJson = path.join(ctxt?.options?.currentWorkingDirectory, 'package.json');
			const pkg = require(projectPackageJson);

			const git = ctxt?.options?.git;
			let trailerMessages = await git?.raw?.('interpret-trailers', path.join(__dirname, '../.gitkeep'));
			trailerMessages = trailerMessages?.replace?.(/\\n/g, '\n')?.replace(/\\t/g, '\t');

			const consolidatedMessage = `Changelog for release ${pkg?.version}\n${trailerMessages ?? ''}`;

			await git?.add?.('.');
			await git?.commit?.(consolidatedMessage, null, {
				'--all': true,
				'--allow-empty': true,
				'--no-verify': true,
				'--signoff': true
			});

			task.title = 'Commit changelog: Done';
		}
		catch(err) {
			task.title = 'Commit changelog: Error';
			ctxt.execError = err;
		}
	}

	_cleanupChangelog(ctxt, task) {
		ctxt.options.changelogText = null;
		ctxt.options.gitLogsInRange = null;
		task.title = 'Clean up: Done';

		return;
	}
	// #endregion

	// #region Release Generation Methods
	async _fetchGitLogsForRelease(ctxt, task) {
		try {
			const git = ctxt?.options?.git;

			// Step 1: Get the repo info for the currentReleaseUpstream
			const gitRemote = await git?.remote?.(['get-url', '--push', ctxt?.options?.currentReleaseUpstream]);

			const hostedGitInfo = require('hosted-git-info');
			const repository = hostedGitInfo?.fromUrl?.(gitRemote);
			repository.project = repository?.project?.replace?.('.git\n', '');

			// Step 2: Instantiate the relevant Git Host Wrapper
			const GitHostWrapper = require(`./../git_host_utilities/${repository?.type}`)?.GitHostWrapper;
			const gitHostWrapper = new GitHostWrapper(ctxt?.options?.[`${repository?.type}Token`]);
			const lastRelease = await gitHostWrapper?.fetchReleaseInformation?.(repository);

			// Step 3: Get the commit associated with that last release, if there is one
			let lastReleasedCommit = null;
			if(lastRelease) {
				lastReleasedCommit = await git?.raw?.(['rev-list', '-n', '1', `tags/${lastRelease?.tag}`]);
				lastReleasedCommit = lastReleasedCommit?.replace?.(/\\n/g, '')?.trim?.();
			}

			// Step 4: Get the commit associated with either the last tag, or the tag specified in the options
			let lastTag = ctxt?.options?.useTag ?? '';
			if(!lastTag?.length) {
				lastTag = await git?.tag?.(['--sort=-creatordate']);
				lastTag = lastTag?.split?.(`\n`)?.shift?.()?.trim?.();
			}

			let lastTaggedCommit = null;
			if(lastTag?.length) {
				lastTaggedCommit = await git?.raw?.(['rev-list', '-n', '1', `tags/${lastTag}`]);
				lastTaggedCommit = lastTaggedCommit?.replace?.(/\\n/g, '')?.trim?.();
			}

			ctxt.options.gitLogsInRange = await this?._fetchGitLogs(git, lastReleasedCommit, lastTaggedCommit);
			task.title = 'Fetch git logs for release: Done';
		}
		catch(err) {
			task.title = 'Fetch git logs for release: Error';

			ctxt.options.gitLogsInRange = {
				'all': []
			};

			ctxt.releaseError = err;
		}
	}

	async _fetchAuthorInformationForRelease(ctxt, task) {
		try {
			const git = ctxt?.options?.git;

			// Step 1: Get the repo info for the currentReleaseUpstream
			const gitRemote = await git?.remote?.(['get-url', '--push', ctxt?.options?.currentReleaseUpstream]);

			const hostedGitInfo = require('hosted-git-info');
			const repository = hostedGitInfo?.fromUrl?.(gitRemote);
			repository.project = repository?.project?.replace?.('.git\n', '');

			// Step 2: Instantiate the relevant Git Host Wrapper
			const GitHostWrapper = require(`./../git_host_utilities/${repository?.type}`)?.GitHostWrapper;
			const gitHostWrapper = new GitHostWrapper(ctxt?.options?.[`${repository?.type}Token`]);

			const contributorSet = [];
			let authorProfiles = [];

			ctxt?.options?.gitLogsInRange?.forEach?.((commitLog) => {
				if(!contributorSet?.includes?.(commitLog?.['author_email'])) {
					contributorSet?.push?.(commitLog['author_email']);
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

			ctxt.options.authorProfiles = authorProfiles;
			task.title = 'Fetch author information for the relevant git log events: Done';
		}
		catch(err) {
			task.title = 'Fetch author information for the relevant git log events: Error';

			ctxt.options.authorProfiles = [];
			ctxt.releaseError = err;
		}
	}

	async _generateReleaseNotes(ctxt, task) {
		try {
			// Step 1: Bucket the Git Log events based on the Conventional Changelog fields
			const featureSet = [];
			const bugfixSet = [];
			const documentationSet = [];

			const humanizeString = require('humanize-string');
			ctxt?.options?.gitLogsInRange?.forEach?.((commitLog) => {
				const commitObject = {
					'hash': commitLog?.hash,
					'component': '',
					'message': commitLog?.message,
					'author_name': commitLog?.['author_name'],
					'author_email': commitLog?.['author_email'],
					'author_profile': ctxt?.options?.authorProfiles?.filter?.((author) => { return author?.email === commitLog?.author_email; })?.[0]?.['profile'],
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

			// Step 2: Compute if this is a pre-release, or a proper release
			const path = require('path');
			const semver = require('semver');

			const projectPackageJson = path.join(ctxt?.options?.currentWorkingDirectory, 'package.json');
			const { version } = require(projectPackageJson);

			if(!version) {
				throw new Error(`package.json at ${projectPackageJson} doesn't contain a version field.`);
			}

			if(!semver.valid(version)) {
				throw new Error(`${projectPackageJson} contains a non-semantic-version format: ${version}`);
			}

			const parsedVersion = semver?.parse?.(version);
			const releaseType = parsedVersion?.prerelease?.length ? 'pre-release' : 'release';

			// Step 3: Generate the release notes
			const gitRemote = await ctxt?.options?.git?.remote?.(['get-url', '--push', ctxt?.options?.currentReleaseUpstream]);

			const hostedGitInfo = require('hosted-git-info');
			const repository = hostedGitInfo?.fromUrl?.(gitRemote);
			repository.project = repository?.project?.replace?.('.git\n', '');

			let lastTag = ctxt?.options?.useTag ?? '';
			if(!lastTag?.length) {
				lastTag = await ctxt?.options?.git?.tag?.(['--sort=-creatordate']);
				lastTag = lastTag?.split?.(`\n`)?.shift?.()?.trim?.();
			}

			const releaseData = {
				'REPO': repository,
				'RELEASE_NAME': ctxt?.options?.releaseName,
				'RELEASE_TYPE': releaseType,
				'RELEASE_TAG': lastTag,
				'NUM_FEATURES': featureSet?.length,
				'NUM_FIXES': bugfixSet?.length,
				'NUM_DOCS': documentationSet?.length,
				'NUM_AUTHORS': ctxt?.options?.authorProfiles?.length,
				'FEATURES': featureSet,
				'FIXES': bugfixSet,
				'DOCS': documentationSet,
				'AUTHORS': ctxt?.options?.authorProfiles
			};

			const ejs = require('ejs');
			const releaseMessagePath = ctxt?.options?.releaseMessage ?? '';
			releaseData['RELEASE_NOTES'] = await ejs?.renderFile?.(releaseMessagePath, releaseData, {
				'async': true,
				'cache': false,
				'debug': false,
				'rmWhitespace': false,
				'strict': false
			});

			ctxt.options.releaseData = releaseData;
			task.title = 'Generate release notes: Done';
		}
		catch(err) {
			task.title = 'Generate release notes: Error';

			ctxt.options.releaseData = null;
			ctxt.releaseError = err;
		}
	}

	async _createRelease(ctxt, task) {
		try {
			// Step 1: Get the repo info for the currentReleaseUpstream
			const gitRemote = await ctxt?.options?.git?.remote?.(['get-url', '--push', ctxt?.options?.currentReleaseUpstream]);

			const hostedGitInfo = require('hosted-git-info');
			const repository = hostedGitInfo?.fromUrl?.(gitRemote);
			repository.project = repository?.project?.replace?.('.git\n', '');

			// Step 2: Instantiate the relevant Git Host Wrapper
			const GitHostWrapper = require(`./../git_host_utilities/${repository?.type}`)?.GitHostWrapper;
			const gitHostWrapper = new GitHostWrapper(ctxt?.options?.[`${repository?.type}Token`]);

			await gitHostWrapper?.createRelease?.(ctxt?.options?.releaseData);
			task.title = 'Push release: Done';
		}
		catch(err) {
			task.title = 'Push release: Error';
			ctxt.releaseError = err;
		}
	}

	async _storeReleaseNotes(ctxt, task) {
		try {
			const mkdirp = require('mkdirp');
			await mkdirp(ctxt?.options?.outputPath);

			for(let idx = 0; idx < ctxt?.options?.outputFormat?.length; idx++) {
				const thisOutputFormat = ctxt?.options?.outputFormat?.[idx];
				switch (thisOutputFormat) {
					case 'json':
						await this?._storeJsonReleaseNotes?.(ctxt);
						break;

					case 'pdf':
						await this?._storePdfReleaseNotes?.(ctxt);
						break;

					default:
						break;
				}
			}

			task.title = 'Store release notes: Done';
		}
		catch(err) {
			task.title = 'Store release notes: Error';
			ctxt.releaseError = err;
		}
	}

	async _storeJsonReleaseNotes(ctxt) {
		const upstreamReleaseData = JSON?.parse?.(JSON?.stringify?.(ctxt?.options?.releaseData));
		delete upstreamReleaseData['RELEASE_NOTES'];

		const path = require('path');
		const filePath = path?.join?.(ctxt?.options?.outputPath, `${ctxt?.options?.currentReleaseUpstream}-release-notes-${upstreamReleaseData?.['RELEASE_NAME']?.toLowerCase?.()?.replace?.(/ /g, '-')}.json`);

		const fs = require('fs/promises');
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		await fs?.writeFile?.(filePath, JSON?.stringify?.(upstreamReleaseData, null, '\t'));
	}

	async _storePdfReleaseNotes(ctxt) {
		const { mdToPdf } = require('md-to-pdf');
		const upstreamReleaseData = ctxt?.options?.releaseData;
		const pdf = await mdToPdf({ 'content': upstreamReleaseData?.['RELEASE_NOTES'] });

		const path = require('path');
		const filePath = path?.join?.(ctxt?.options?.outputPath, `${ctxt?.options?.currentReleaseUpstream}-release-notes-${upstreamReleaseData?.['RELEASE_NAME']?.toLowerCase?.()?.replace?.(/ /g, '-')}.pdf`);

		const fs = require('fs/promises');
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		await fs?.writeFile?.(filePath, pdf?.content);
	}
	// #endregion

	// #region Utility Methods
	async _sleep(ms) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}
	// #endregion

	// #region Private Fields
	#execMode = null;
	// #endregion
}

// Add the command to the cli
exports.commandCreator = function commandCreator(commanderProcess, configuration) {
	const Commander = require('commander');
	const release = new Commander.Command('release');

	// Get package.json into memory... we'll use it in multiple places here
	const path = require('path');
	const projectPackageJson = path.join((configuration?.release?.currentWorkingDirectory?.trim?.() ?? process.cwd()), 'package.json');
	const pkg = require(projectPackageJson);

	// Get the dynamic template filler - use it for configuration substitution
	const fillTemplate = require('es6-dynamic-template');

	if(configuration?.release?.currentWorkingDirectory) {
		configuration.release.currentWorkingDirectory = fillTemplate?.(configuration?.release?.currentWorkingDirectory, pkg);
	}

	if(configuration?.release?.commitMessage) {
		configuration.release.commitMessage = fillTemplate?.(configuration?.release?.commitMessage, pkg);
	}

	if(configuration?.release?.useTag) {
		configuration.release.useTag = fillTemplate?.(configuration?.release?.useTag, pkg);
	}

	if(configuration?.release?.tagName) {
		configuration.release.tagName = fillTemplate?.(configuration?.release?.tagName, pkg);
	}

	if(configuration?.release?.tagMessage) {
		configuration.release.tagMessage = fillTemplate?.(configuration?.release?.tagMessage, pkg);
	}

	if(configuration?.release?.releaseName) {
		configuration.release.releaseName = fillTemplate?.(configuration?.release?.releaseName, pkg);
	}

	if(configuration?.release?.releaseMessage) {
		configuration.release.releaseMessage = fillTemplate?.(configuration?.release?.releaseMessage, pkg);
	}

	if(configuration?.release?.outputPath) {
		configuration.release.outputPath = fillTemplate?.(configuration?.release?.outputPath, pkg);
	}

	// Setup the command
	release?.alias?.('rel');
	release
		?.option?.('--current-working-directory <folder>', 'Path to the current working directory', configuration?.release?.currentWorkingDirectory?.trim?.() ?? process?.cwd?.())

		?.option?.('--commit', 'Commit code if branch is dirty', configuration?.release?.commit ?? false)
		?.option?.('--commit-message', 'Commit message if branch is dirty. Ignored if --commit is not passed in', configuration?.release?.commitMessage ?? '')

		?.option?.('--no-tag', 'Don\'t tag now. Use last tag when cutting this release', configuration?.release?.tag ?? false)
		?.option?.('--use-tag <name>', 'Use the (existing) tag specified when cutting this release', configuration?.release?.useTag?.trim?.() ?? '')
		?.option?.('--tag-name <name>', 'Tag Name to use for this release', configuration?.release?.tagName?.trim?.() ?? `V${pkg?.version}`)
		?.option?.('--tag-message <message>', 'Message to use when creating the tag.', configuration?.release?.tagMessage?.trim?.() ?? `The spaghetti recipe at the time of releasing V${pkg.version}`)

		?.option?.('--no-release', 'Don\'t release now. Simply tag and exit', configuration?.release?.release ?? false)
		?.option?.('--release-name <name>', 'Name to use for this release', configuration?.release?.releaseName?.trim?.() ?? `V${pkg.version} Release`)
		?.option?.('--release-message <path to release notes EJS>', 'Path to EJS file containing the release message/notes, with/without a placeholder for auto-generated metrics', configuration?.release?.releaseMessage?.trim?.() ?? '')

		?.option?.('--output-format <json|pdf|all>', 'Format(s) to output the generated release notes', configuration?.release?.outputFormat?.trim?.() ?? 'none')
		?.option?.('--output-path <release notes path>', 'Path to store the generated release notes at', configuration?.release?.outputPath?.trim?.() ?? '.')

		?.option?.('--upstream <remotes-list>', 'Comma separated list of git remote(s) to push the release to', configuration?.release?.upstream?.trim?.() ?? 'upstream')

		?.option?.('--github-token <token>', 'Token to use for creating the release on GitHub', configuration?.release?.githubToken?.trim?.() ?? process.env.GITHUB_TOKEN)
		?.option?.('--gitlab-token <token>', 'Token to use for creating the release on GitLab', configuration?.release?.gitlabToken?.trim?.() ?? process.env.GITLAB_TOKEN)
	;

	const commandObj = new ReleaseCommandClass({ 'execMode': 'cli' });
	release?.action?.(commandObj?.execute?.bind?.(commandObj, configuration?.release));

	// Add it to the mix
	commanderProcess?.addCommand?.(release);
	return;
};

// Export the API for usage by downstream programs
exports.apiCreator = function apiCreator() {
	const commandObj = new ReleaseCommandClass({ 'execMode': 'api' });
	return {
		'name': 'release',
		'method': commandObj?.execute?.bind?.(commandObj)
	};
};
