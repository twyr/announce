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
	 * @name		fetchReleaseInformation
	 *
	 * @param		{object} repository - the GitHub repository to query for the release
	 * @param		{string} releaseName - the name of the release
	 *
	 * @return		{object} The required information about the release from GitHub.
	 *
	 * @summary  	Given a GitHub repository, and the required release name, returns information about the release.
	 *
	 */
	async fetchReleaseInformation(repository, releaseName) {
		const allReleases = await this._fetchData(`https://api.${repository.domain}/repos/${repository.user}/${repository.project}/releases`);
		const releaseInfo = allReleases?.filter?.((release) => { return (release?.name === releaseName); })?.shift?.();

		return {
			'prerelease': releaseInfo?.prerelease,
			'tarball_url': releaseInfo?.tarball_url
		};
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
