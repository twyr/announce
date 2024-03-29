#### RELEASE COMMAND

##### Basics
The release command is the second-of-three-steps in the Twy'r release workflow,
succeeding the [prepare](PREPARE_COMMAND.md) and preceding the [publish](PUBLISH_COMMAND.md)
steps.

In this step, the workflow generates a changelog containing all the features/fixes since the
last release (using commit messages in the git log), commits and pushes the code to the upstream
repository, creates a tag, and uses that to publish a release in GitHub / GitLab.

###### NOTE
This command assumes that a GitHub / GitLab Token, with the required permissions to create a release,
has been configured and available for use.

If no token has been passed in via the CLI options / API configuration, it expects a token to
be present at the environment variable GITHUB_TOKEN / GITLAB_TOKEN

##### Command Flow

The release command executes the following steps:

1. Check if the code needs to be stashed/committed (based on passed-in options), and execute the step.
1. Generate the CHANGELOG using commit messages in the git log - starting from the last tag
1. Commit the CHANGELOG
1. Create the appropriate tag with a label configured according to the preferences
1. Push the commit and the tag to the specified upstream repository/branch
1. Generate the Release Notes using commit messages in the git log - starting from the last release
1. Embed generated release notes into the release file using EJS tags
1. Create a GitHub/GitLab Release with the tag, and set the release notes using the generated notes
1. Store generated release notes in JSON and/or PDF formats at --output-path
1. Un-stash dirty code if stashed in the first step

##### CLI Options

Release Command Options:

| Option | Description |
| --current-working-directory | Path to the root of the package / package.json  |
|   |   |
| --- | --- |
| --commit | Commit code if the branch is dirty |
| --commit-message | Message to use while committing code. Ignored if commit = false |
|   |   |
| --no-tag | Don't tag now. Use the last created tag when cutting this release |
| --use-tag | Use the (existing) tag specified when cutting this release |
| --tag-name | Tag Name to use for this release |
| --tag-message | Message to use when creating the tag |
|   |   |
| --no-release | Don't release now. Simply tag and exit |
| --release-name | Release Name to use for this release |
| --release-message | Path to markdown file containing release notes - CHANGELOG will be embedded into this file at the specified location |
|   |   |
| --output-format | Format(s) to output the generated release notes |
| --output-path | 'Path to store the generated release notes at |
|   |   |
| --upstream | Comma separated list of Git remote(s) to push the release to |
|   |   |
| --github-token | Token to use when accessing the release on the GitHub repository |
| --gitlab-token | Token to use when accessing the release on the GitLab repository |

Global Options inherited by the Release Command:

| Option | Description |
| --- | --- |
| -h, --help | Displays this information. |

##### Configuration (.announcerc file)

```
{
    'release': {
		'currentWorkingDirectory': 'location of package.json',

        'commit': true/false, // Default is to stash and un-stash [default: false]
        'commitMessage': 'commit message', // Message to use while committing code. Ignored if commit = false [default: '']

        'noTag': true/false, // Use the last created tag when cutting this release [default: false]
        'useTag': 'tag name', // Use the (existing) tag specified when cutting this release  [default: '']
        'tagName': 'tag name', // Name of the tag used for this release [default: V${package version}]
        'tagMessage': 'tag message', // Message to use while tagging [default: '']

        'noRelease': true/false, // Don't release now. Simply tag and exit
        'releaseName': 'release name', // [default: V${package version} Release]
        'releaseMessage': 'path to markdown file containing custom notes for this release', // [default: '']

        'outputFormat': 'format(s) to output generated release notes', // Output the generated release notes in JSON, PDF, or Both formats [default: all]
        'outputPath': 'path to store the generated release notes at', // Store the generated release notes [default: .]

        'upstream': 'remotes-list', // Comma seaparated list of git remote(s) to push the release to [default: 'upstream']

        'githubToken': 'GITHUB_TOKEN', // Token to use for reading the release details from GitHub [default: $GITHUB_TOKEN environment variable]
        'gitlabToken': 'GITLAB_TOKEN' // Token to use for reading the release details from GitLab [default: $GITLAB_TOKEN environment variable]
    }
}
```

##### Invoking via API

The release command can be integrated into another module, and invoked as:

```
const announce = require('@twyr/announce);
announce.release({
	'currentWorkingDirectory': 'location of package.json',

    'commit': true/false, // Commit code if branch is dirty [default: false]
    'commitMessage': 'commit message', // Message to use while committing code. Ignored if commit = false [default: '']

    'noTag': true/false, // Use the last created tag when cutting this release [default: false]
    'useTag': 'tag name', // Use the (existing) tag specified when cutting this release [default: '']
    'tagName': 'tag name', // Name of the tag used for this release [default: V${package version}]
    'tagMessage': 'tag message', // Message to use while tagging [default: '']

    'noRelease': true/false, // Don't release now. Simply tag and exit
    'releaseName': 'release name', // Name of the release [default: V${package version} Release]
    'releaseMessage': 'path to markdown file containing custom notes for this release', // [default: '']

    'outputFormat': 'format(s) to output generated release notes', // Output the generated release notes in JSON, PDF, or Both formats [default: none]
    'outputPath': 'path to store the generated release notes at', // Store the generated release notes [default: .]

    'upstream': 'remotes-list', // Comma seaparated list of git remote(s) to push the release to [default: 'upstream']

    'githubToken': 'XXX', // Token to use for creating the release on GitHub [default: $GITHUB_TOKEN environment variable]
    'gitlabToken': 'XXX', // Token to use for creating the release on GitLab [default: $GITLAB_TOKEN environment variable]

    'logger': object // Logger instance
});
```
