#### RELEASE COMMAND

##### Basics
The release command is the second-of-three-steps in the Twy'r release workflow,
succeeding the [prepare](PREPARE_COMMAND.md) and preceding the [publish](PUBLISH_COMMAND.md)
steps.

In this step, the workflow generates a changelog containing all the features/fixes since the
last release (using commit messages in the git log), commits and pushes the code to the upstream
repository, creates a tag, and uses that to publish a release in Github.

##### Command Flow

The release command executes the following steps:

1. Check if the code needs to be stashed/committed (based on passed-in options), and execute the step.
1. Generate the CHANGELOG using commit messages in the git log
1. Commit the CHANGELOG
1. Create the appropriate tag with a label configured according to the preferences
1. Push the commit and the tag to the specified upstream repository/branch
1. Create a Github Release with the tag, and using the newly created CHANGELOG entries
1. Un-stash dirty code if stashed in the first step

##### CLI Options

Release Command Options:

| Option | Description |
| --- | --- |
| -c, --commit | Commit code if the branch is dirty |
| -gt, --github-token | Token to be use when generating the release on the Github repository |
| -m, --message | Message to use while committing code. Ignored if commit = false |
| -rn, --release-note | Path to markdown file containing release notes - CHANGELOG will be embedded into this file at the specified location |
| -tn, --tag-name | Tag Name to use for this release |
| -tm, --tag-message | Message to use when creating the tag |
| -u, --upstream | Git remote name of the upstream repository for the release |

Global Options inherited by the Release Command:

| Option | Description |
| --- | --- |
| -d, --debug | Turn debug mode on/off. Default is off. If turned on, use announce:release as the debug key |
| -s, --silent | Turns off all logs from the execution. If turned on, overrides the "quiet" option. Default is false. |
| -q, --quiet | Reduces logging to a bare minimum. Overridden by the "silent" option, if that is enabled. Default is false. |
| -h, --help | Displays this information. |

##### Configuration (.announcerc file)

```
{
    'release': {
        'commit': true/false, // Default is to stash and un-stash [default: false]
        'githubToken': 'GITHUB_TOKEN', // default: $GITHUB_TOKEN environment variable
        'message': 'commit message', // Message to use while committing code. Ignored if commit = false [default: '']
        'releaseNote': 'path to markdown file containing custom notes for this release', // [default: '']
        'tagName': 'tag name', // Name of the tag used for this release [default: V${package version}]
        'tagMessage': 'tag message', // Message to use while tagging [default: '']
        'upstream': 'git remote name of the upstream repository', // [default: 'upstream']

        'debug': true/false, // Enable debug logging as announce:prepare if enabled [default: false]
        'silent': true/false, // Enable silent mode - turn off logging to the logger passed into the object - overrides "quiet" option [default: false]
        'quiet': true/false // Enable quiet mode - reduce logging to the logger passed into the object [default: false]
    }
}
```

##### Invoking via API

The release command can be integrated into another module, and invoked as:

```
const announce = require('@twyr/announce);
announce.release({
    'commit': true/false, // Commit code if branch is dirty [default: false]
    'githubToken': 'XXX' // Token to use for creating the release on Github [default: process.env.GITHUB_TOKEN environment variable]
    'message': 'commit message', // Message to use while committing code. Ignored if commit = false [default: '']
    'releaseNote': 'path to markdown file containing custom notes for this release', // [default: '']
    'tagName': 'tag name', // Name of the tag used for this release [default: V${package version}]
    'tagMessage': 'tag message', // Message to use while tagging [default: '']
   'upstream': 'git remote name of the upstream repository', // [default: 'upstream']

    'debug': true/false, // Enable debug logging as announce:release if enabled [default: false]
    'silent': true/false, // Enable silent mode - turn off logging to the logger passed into the object - overrides "quiet" option [default: false]
    'quiet': true/false // Enable quiet mode - reduce logging to the logger passed into the object [default: false]
}, logger);
```
