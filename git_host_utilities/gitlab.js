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
 * @class		GitLabWrapper
 * @classdesc	The command class that wraps GitLab related functionality for Release and Publish.
 *
 * @param		{string} gitlabToken - The GitLab Personal Access Token to be used to access the repositories
 *
 * @description
 * The wrapper class that provides an API interface for all GitLab related operations.
 *
 */
class GitLabWrapper {
	// #region Constructor
	constructor(gitlabToken) {
		Object.defineProperty(this, 'pat', {
			'value': gitlabToken
		});

		const GitLab = require('@gitbeaker/node')?.Gitlab;
		Object.defineProperty(this, 'client', {
			'value': new GitLab({ 'token': this.pat })
		});
	}
	// #endregion

	// #region Public API
	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	GitLabWrapper
	 * @name		fetchReleaseInformation
	 *
	 * @param		{object} repository - the GitLab repository to query for the release
	 * @param		{string} releaseName - the name of the release
	 *
	 * @return		{object} The required information about the release from GitLab.
	 *
	 * @summary  	Given a GitLab repository, and the required release name, returns information about the release.
	 *
	 */
	async fetchReleaseInformation(repository, releaseName) {
		const allReleases = await this.client.Releases.all(`${repository.user}/${repository.project}`);
		const releaseInfo = allReleases?.filter?.((release) => { return (release?.name === releaseName); })?.shift?.();

		return {
			'prerelease': releaseInfo?.upcoming_release,
			'tarball_url': releaseInfo?.assets?.sources?.filter?.((source) => { return source.format === 'tar.gz'; })?.[0]?.['url']
		};
	}
	// #endregion

	// #region Private Methods
	// #endregion

	// #region Private Fields
	// #endregion
}

exports.GitLabWrapper = GitLabWrapper;
