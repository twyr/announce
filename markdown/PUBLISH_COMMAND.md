#### PUBLISH COMMAND

##### Basics
The publish command is the third-of-three-steps in the Twy'r release workflow,
succeeding the [prepare](PREPARE_COMMAND.md) and the [release](RELEASE_COMMAND.md)
steps.

In this step, the workflow looks up a release in Github, and publishes the source asset to npm.

###### NOTE
This command assumes that a Github Token, with the required permissions to read the release list,
has been configured and available for use. If no token has been passed in via the CLI options / 
API configuration, it expects a token to be present at the environment variable GITHUB_TOKEN

This command also requires that an [NPM Automation Token](https://docs.npmjs.com/creating-and-viewing-access-tokens)
has been generated and stored in the environment variable NPM_TOKEN.

This command expects that the module to be published has a valid *.npmrc* file in the root
folder of the tree that will be published.

##### Command Flow

The publish command executes the following steps:

1. Check that the specified (or the latest) release exists on Github
1. Get the URL to the compressed source code asset attached to the release on Github
1. Publish the compressed source to NPM using the *npm publish* command

##### CLI Options

Publish Command Options:

| Option | Description |
| --- | --- |
| --access | Access to be specified on the published NPM package |
| --dist-tag | Tag to be applied to the published NPM package - defaults to **latest** for *normal* releases, and **next** for *prereleases* |
| --dry-run | Do a dry run to check the output. Don't actually publish it to NPM |
| -gt, --github-token | Token to be use when accessing the release on the Github repository |
| -nt, --npm-token | Token to be use when publishing the release to the NPM repository |
| -rn, --release-name | Release Name to use for publishing to NPM |
| -u, --upstream | Git remote name of the upstream repository to pick the release from |

Global Options inherited by the Publish Command:

| Option | Description |
| --- | --- |
| -d, --debug | Turn debug mode on/off. Default is off. If turned on, use announce:publish as the debug key |
| -s, --silent | Turns off all logs from the execution. If turned on, overrides the "quiet" option. Default is false. |
| -q, --quiet | Reduces logging to a bare minimum. Overridden by the "silent" option, if that is enabled. Default is false. |
| -h, --help | Displays this information. |

##### Configuration (.announcerc file)

```
{
    'publish': {
		'access': 'public|restricted', // See *npm help publish* for details
		'distTag': 'latest', // See *npm help publish*, the --tag option, for details
		'dryRun': false, // See *npm help publish*, the --dry-run option, for details

        'githubToken': 'GITHUB_TOKEN', // default: $GITHUB_TOKEN environment variable
        'npmToken': 'NPM_TOKEN', // default: $NPM_TOKEN environment variable

        'releaseName': 'release name', // [default: V${package version} Release]
        'upstream': 'git remote name of the upstream repository', // [default: 'upstream']

        'debug': true/false, // Enable debug logging as announce:prepare if enabled [default: false]
        'silent': true/false, // Enable silent mode - turn off logging to the logger passed into the object - overrides "quiet" option [default: false]
        'quiet': true/false // Enable quiet mode - reduce logging to the logger passed into the object [default: false]
    }
}
```

##### Invoking via API

The publish command can be integrated into another module, and invoked as:

```
const announce = require('@twyr/announce);
announce.publish({
    'access': 'public|restricted', // See *npm help publish* for details
    'distTag': 'latest', // See *npm help publish*, the --tag option, for details
    'dryRun': false, // See *npm help publish*, the --dry-run option, for details

    'githubToken': 'XXX', // Token to use for reading the release details from Github [default: process.env.GITHUB_TOKEN environment variable]
    'npmToken': 'NPM_TOKEN', // default: $NPM_TOKEN environment variable

    'releaseName': 'release name', // Name of the release [default: V${package version} Release]
    'upstream': 'git remote name of the upstream repository', // [default: 'upstream']

    'debug': true/false, // Enable debug logging as announce:publish if enabled [default: false]
    'silent': true/false, // Enable silent mode - turn off logging to the logger passed into the object - overrides "quiet" option [default: false]
    'quiet': true/false // Enable quiet mode - reduce logging to the logger passed into the object [default: false]
}, logger);
```
