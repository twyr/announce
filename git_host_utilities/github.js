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
 * @class		GitHubWrapper
 * @classdesc	The command class that wraps GitHub related functionality for Release and Publish.
 *
 * @param		{string} githubToken - The GitHub Personal Access Token to be used to access the repositories
 *
 * @description
 * The wrapper class that provides an API interface for all GitHub related operations.
 *
 */
class GitHubWrapper {
	// #region Constructor
	constructor(githubToken) {
		Object.defineProperty(this, 'pat', {
			'value': githubToken
		});

		Object.defineProperty(this, 'client', {
			'value': require('octonode')?.client?.(this?.pat)
		});
	}
	// #endregion

	// #region Public API
	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	GitHubWrapper
	 * @name		fetchCommitInformation
	 *
	 * @param		{object} repository - the GitHub repository to query for the release
	 * @param		{string} commitLog - the git commit object for which commit information needs to be fetched
	 *
	 * @return		{object} The required information about the commit from GitHub.
	 *
	 * @summary  	Given a GitHub repository, returns information about the commit pointed to by the commitLog object.
	 *
	 */
	async fetchCommitInformation(repository, commitLog) {
		const ghRepo = this?.client?.repo?.(`${repository?.user}/${repository?.project}`);
		const commit = await ghRepo?.commitAsync?.(commitLog?.hash);

		return commit[0];
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	GitHubWrapper
	 * @name		fetchCommitAuthorInformation
	 *
	 * @param		{object} repository - the GitHub repository to query for the release
	 * @param		{string} commitLog - the git commit object for which the author information needs to be fetched
	 *
	 * @return		{object} The required information about the commit author from GitHub.
	 *
	 * @summary  	Given a GitHub repository, returns information about the commit author pointed to by the commitLog object.
	 *
	 */
	async fetchCommitAuthorInformation(repository, commitLog) {
		const ghRepo = this?.client?.repo?.(`${repository?.user}/${repository?.project}`);

		let commit = await ghRepo?.commitAsync?.(commitLog?.hash);
		commit = commit[0];

		return {
			'name': commit?.commit?.author?.name,
			'email': commit?.commit?.author?.email,
			'profile': commit?.author?.html_url,
			'avatar': commit?.author?.avatar_url
		};
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	GitHubWrapper
	 * @name		fetchReleaseInformation
	 *
	 * @param		{object} repository - the GitHub repository to query for the release
	 * @param		{string} releaseName - the name of the release
	 *
	 * @return		{object} The required information about the release from GitHub.
	 *
	 * @summary  	Given a GitHub repository, returns information about the release - either the latest, or the one matching the specified release name.
	 *
	 */
	async fetchReleaseInformation(repository, releaseName) {
		const ghRepo = this?.client?.repo?.(`${repository?.user}/${repository?.project}`);

		let allReleases = await ghRepo?.releasesAsync?.();
		allReleases = allReleases[0];

		if(releaseName && releaseName?.trim?.()?.length) {
			const releaseInfo = allReleases?.filter?.((release) => { return (release?.name === releaseName); })?.shift?.();

			return {
				'name': releaseInfo?.name,
				'prerelease': releaseInfo?.prerelease,
				'published': releaseInfo?.published_at,
				'tarball_url': releaseInfo?.tarball_url,
				'tag': releaseInfo?.tag_name
			};
		}

		const releaseInfo = allReleases?.map?.((release) => {
			return {
				'name': release?.name,
				'prerelease': release?.prerelease,
				'published': release?.published_at,
				'tarball_url': release?.tarball_url,
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
	 * @memberof	GitHubWrapper
	 * @name		createRelease
	 *
	 * @param		{object} releaseData - The data required for creating a release on GitHub
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Given the required data, creates a release on Github.
	 *
	 */
	async createRelease(releaseData) {
		const promises = require('bluebird');
		const clientPost = promises?.promisify?.(this?.client?.post?.bind?.(this?.client));

		const repository = releaseData['REPO'];
		await clientPost?.(`https://api.${repository.domain}/repos/${repository.user}/${repository.project}/releases`, {
			'accept': 'application/vnd.github.v3+json',
			'tag_name': releaseData?.['RELEASE_TAG'],
			'name': releaseData?.['RELEASE_NAME'],
			'body': releaseData?.['RELEASE_NOTES'],
			'prerelease': !!(releaseData?.['RELEASE_TYPE'] === 'pre-release')
		});
	}

	/**
	 * @function
	 * @instance
	 * @memberof	GitHubWrapper
	 * @name		getCommitLink
	 *
	 * @param		{object} repository - the GitHub repository to query for the release
	 * @param		{object} commitLog - the commit information
	 *
	 * @return		{object} The URL to access the commit on GitHub.
	 *
	 * @summary  	Given a GitHub repository, and a commit, returns the URL to access the commit directly.
	 *
	 */
	getCommitLink(repository, commitLog) {
		return `https://${repository?.domain}/${repository?.user}/${repository?.project}/commit/${commitLog?.hash})`;
	}
	// #endregion

	// #region Private Methods
	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	GitHubWrapper
	 * @name		_fetchData
	 *
	 * @param		{string} url - the url giving the information we seek
	 *
	 * @return		{object} Hopefully, the required information from GitHub.
	 *
	 * @summary  	Given a GitHub REST API endpoint, call it and give back the information returned.
	 *
	 */
	async _fetchData(url) {
		const Promise = require('bluebird');
		return new Promise((resolve, reject) => {
			try {
				this?.client?.get?.(url, {}, (err, status, body) => {
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

exports.GitHubWrapper = GitHubWrapper;
