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
	 * @name		fetchCommitInformation
	 *
	 * @param		{object} repository - the GitLab repository to query for the release
	 * @param		{string} commitLog - the git commit object for which commit information needs to be fetched
	 *
	 * @return		{object} The required information about the commit from GitLab.
	 *
	 * @summary  	Given a GitLab repository, returns information about the commit pointed to by the commitLog object.
	 *
	 */
	async fetchCommitInformation(repository, commitLog) {
		const commit = await this.client.Commits.show(`${repository.user}/${repository.project}`, commitLog.hash);
		return commit;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	GitLabWrapper
	 * @name		fetchCommitAuthorInformation
	 *
	 * @param		{object} repository - the GitLab repository to query for the release
	 * @param		{string} commitLog - the git commit object for which the author information needs to be fetched
	 *
	 * @return		{object} The required information about the commit author from GitLab.
	 *
	 * @summary  	Given a GitLab repository, returns information about the commit author pointed to by the commitLog object.
	 *
	 */
	async fetchCommitAuthorInformation(repository, commitLog) {
		const commit = await this.client.Commits.show(`${repository.user}/${repository.project}`, commitLog.hash);

		return {
			'name': commit?.author_name,
			'email': commit?.author_email,
			'profile': commit?.author?.html_url,
			'avatar': commit?.author?.avatar_url
		};
	}

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
	 * @summary  	Given a GitLab repository, returns information about the release - either the latest, or the one matching the specified release name.
	 *
	 */
	async fetchReleaseInformation(repository, releaseName) {
		const allReleases = await this.client.Releases.all(`${repository.user}/${repository.project}`);

		if(releaseName && releaseName?.trim?.()?.length) {
			const releaseInfo = allReleases?.filter?.((release) => { return (release?.name === releaseName); })?.shift?.();

			return {
				'name': releaseInfo?.name,
				'prerelease': releaseInfo?.upcoming_release,
				'published': releaseInfo?.created_at,
				'tarball_url': releaseInfo?.assets?.sources?.filter?.((source) => { return source.format === 'tar.gz'; })?.[0]?.['url'],
				'tag': releaseInfo?.tag_name
			};
		}

		const releaseInfo = allReleases?.map?.((release) => {
			return {
				'name': release?.name,
				'prerelease': release?.upcoming_release,
				'published': release?.created_at,
				'tarball_url': release?.assets?.sources?.filter?.((source) => { return source.format === 'tar.gz'; })?.[0]?.['url'],
				'tag': release?.tag_name
			};
		})
		?.sort?.((left, right) => {
			return (new Date(right?.published))?.valueOf() - (new Date(left?.published))?.valueOf();
		})
		?.shift?.();

		return releaseInfo;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	GitLabWrapper
	 * @name		getCommitLink
	 *
	 * @param		{object} repository - the GitLab repository to query for the release
	 * @param		{object} commitLog - the commit information
	 *
	 * @return		{object} The URL to access the commit on GitLab.
	 *
	 * @summary  	Given a GitLab repository, and a commit, returns the URL to access the commit directly.
	 *
	 */
	getCommitLink(repository, commitLog) {
		return `https://${repository?.domain}/${repository?.user}/${repository?.project}/commit/${commitLog?.hash})`;
	}
	// #endregion

	// #region Private Methods
	// #endregion

	// #region Private Fields
	// #endregion
}

exports.GitLabWrapper = GitLabWrapper;
