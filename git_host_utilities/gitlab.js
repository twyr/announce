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
 * @param		{string} token - The GitLab Personal Access Token to be used to access the repositories
 *
 * @description
 * The wrapper class that provides an API interface for all GitLab related operations.
 *
 */
class GitLabWrapper {
	// #region Constructor
	constructor(token) {
		const GitLab = require('@gitbeaker/node')?.Gitlab;
		this.#client = new GitLab({ 'token': token });
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
		const commit = await this.#client?.Commits?.show?.(`${repository?.user}/${repository?.project}`, commitLog?.hash);
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
		const commit = await this.#client?.Commits?.show?.(`${repository?.user}/${repository?.project}`, commitLog?.hash);
		const author = await this.#client?.Users?.search?.(commit?.author_email);

		return {
			'name': commit?.author_name,
			'email': commit?.author_email,
			'profile': author?.[0]?.web_url,
			'avatar': author?.[0]?.avatar_url
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
		const allReleases = await this.#client?.Releases?.all?.(`${repository?.user}/${repository?.project}`);

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
	 * @async
	 * @function
	 * @instance
	 * @memberof	GitLabWrapper
	 * @name		createRelease
	 *
	 * @param		{object} releaseData - The data required for creating a release on GitLab
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Given the required data, creates a release on GitLab.
	 *
	 */
	async createRelease(releaseData) {
		const repository = releaseData['REPO'];
		await this.#client?.Releases?.create?.(`${repository?.user}/${repository?.project}`, {
			'name': releaseData?.['RELEASE_NAME'],
			'tag_name': releaseData?.['RELEASE_TAG'],
			'description': releaseData?.['RELEASE_NOTES'],
			'released_at': !!(releaseData?.['RELEASE_TYPE'] === 'pre-release') ? '9999-12-31T23:59:59.9999Z' : null
		});
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
	#client = null;
	// #endregion
}

exports.GitHostWrapper = GitLabWrapper;
