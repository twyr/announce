#### PUBLISH COMMAND

##### Basics
The publish command is the third-of-three-steps in the Twy'r release workflow,
succeeding the [prepare](PREPARE_COMMAND.md) and the [release](RELEASE_COMMAND.md)
steps.

In this step, the workflow looks up a release on a Git host (GitHub, Gitlab, etc.), and publishes the source asset to npm.

###### NOTE
This command assumes that a GitHub/GitLab Token, with the required permissions to read the release list,
has been configured and available for use. If no token has been passed in via the CLI options /
API configuration, it expects a token to be present at the environment variable GITHUB_TOKEN/GITLAB_TOKEN

This command also requires that an [NPM Automation Token](https://docs.npmjs.com/creating-and-viewing-access-tokens),
with publish permissions, has been generated and stored in the environment variable NPM_TOKEN.

This command expects that the module to be published has a valid *.npmrc* file in the root
folder of the tree that will be published.

##### Command Flow

The publish command executes the following steps:

1. Check that the specified (or the latest) release exists on GitHub / GitLab
1. Get the URL to the compressed source code asset attached to the release on GitHub / GitLab
1. Publish the compressed source to NPM using the *npm publish* command

##### CLI Options

Publish Command Options:

| Option | Description |
| --- | --- |
| --current-working-directory | Path to the root of the package / package.json  |
|   |   |
| --access | Access to be specified on the published NPM package |
| --dist-tag | Tag to be applied to the published NPM package - defaults to **latest** for *normal* releases, and **next** for *prereleases* |
| --dry-run | Do a dry run to check the output. Don't actually publish it to NPM |
|   |   |
| --github-token | Token to use when accessing the release on the GitHub repository |
| --gitlab-token | Token to use when accessing the release on the GitLab repository |
| --npm-token | Token to use when publishing the release to the NPM repository |
|   |   |
| --release-name | Release Name to use for publishing to NPM |
| --upstream | Git remote name of the upstream repository to pick the release from |

Global Options inherited by the Publish Command:

| Option | Description |
| --- | --- |
| -h, --help | Displays this information. |

##### Configuration (.announcerc file)

```
{
    'publish': {
		'currentWorkingDirectory': 'location of package.json',

        'access': 'public|restricted', // See *npm help publish* for details
        'distTag': 'latest', // See *npm help publish*, the --tag option, for details
        'dryRun': false, // See *npm help publish*, the --dry-run option, for details

        'githubToken': 'GITHUB_TOKEN', // Token to use for reading the release details from GitHub [default: $GITHUB_TOKEN environment variable]
        'gitlabToken': 'GITLAB_TOKEN', // Token to use for reading the release details from GitLab [default: $GITLAB_TOKEN environment variable]
        'npmToken': 'NPM_TOKEN', // Token to use for publishing the release to NPM [default: $NPM_TOKEN environment variable]

        'releaseName': 'release name', // Name of the release [default: V${package version} Release]
        'upstream': 'git remote name of the upstream repository' // The Git remote name of the repository containing the release assets' [default: 'upstream']
    }
}
```

##### Invoking via API

The publish command can be integrated into another module, and invoked as:

```
const announce = require('@twyr/announce);
announce.publish({
	'currentWorkingDirectory': 'location of package.json',

    'access': 'public|restricted', // See *npm help publish* for details
    'distTag': 'latest', // See *npm help publish*, the --tag option, for details
    'dryRun': false, // See *npm help publish*, the --dry-run option, for details

    'githubToken': 'XXX', // Token to use for reading the release details from GitHub [default: $GITHUB_TOKEN environment variable]
    'gitlabToken': 'XXX', // Token to use for reading the release details from GitLab [default: $GITLAB_TOKEN environment variable]
    'npmToken': 'NPM_TOKEN', // Token to use for publishing the release to NPM [default: $NPM_TOKEN environment variable]

    'releaseName': 'release name', // Name of the release [default: V${package version} Release]
    'upstream': 'remote name', // The Git remote name of the repository containing the release assets' [default: 'upstream']

    'logger': object // Logger instance
});
```
