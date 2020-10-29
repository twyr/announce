#### PREPARE COMMAND

##### Basics
The prepare command is the first-of-three-steps in the Twy'r release workflow,
preceding the [release](RELEASE_COMMAND.md) and the [publish](PUBLISH_COMMAND.md)
steps.

In this step, the workflow simply increments the current version of the package
(as defined in the root level package.json) to the next version - either in the
same series or the next (as defined in the "Version Ladder" - see below).

##### The Version Ladder
The "version ladder" from release-to-release is usually defined as:
dev => alpha => beta => rc => patch / minor / major => dev(next-version)

Each "stage" in the version ladder is considered a "series" - either "single-step" or
"multi-step". If the series is "multi-step" (consists of multiple steps), each "step"
contains additional version information for unique identification of the "step" within
the series.

The dev / alpha / beta / rc series are "multi-step", and therefore, each step
in the series is identified with the {{series}}.{{step number}} label [dev.0, dev.1,
alpha.0, etc.]

The patch / minor / major series are considered "single step", and therefore identified
with a canonical "semantic version" {{major.minor.patch}} [1.3.5, 2.0.3, etc.]

dev => alpha => beta are usually "private" releases, and are (typically) not available
to anyone outside the development team. In certain cases, beta releases may be made
available to a restricted set of outsiders as part of "early feedback collection" cycle.

The rc releases are usually made available to the general public, and typically released on
npm tagged as "@next". This is done for collecting feedback / bugs from the wider community,
as well as to give downstream packages/projects the time needed to make any changes mandated
by the new version - before the package is actually released.

The patch / minor / major releases are considered "public" releases - in other words, they are
made available to "everyone" via the package registry and all users are encouraged to upgrade.

Once a "public" release is done & dusted, development for the next set of changes is expected
to immediately begin - with the next (higher) version number and a "dev" series tag.

##### Version Increment Semantics

Given the default version ladder *(dev, alpha, beta, rc, patch, minor, major)*, the next version
is calculated according to the following semantics:

| Series | => | current | next | patch | minor | major |
| --- | --- | --- | --- | --- | --- | --- |
| V 0.0.1-dev.0 | => | 0.0.1-dev.1 | 0.0.1-alpha.0 | 0.0.1 | 0.1.0 | 1.0.0 |
| V 0.1.0 | => | 0.1.1 | 0.1.1-dev.0 | 0.1.1 | 0.2.0 | 1.0.0 |
| V 1.0.0 | => | 1.0.1 | 1.0.1-dev.0 | 1.0.1 | 1.1.0 | 2.0.0 |

##### Command Flow

The prepare command executes the following steps:

1. Check if package.json exists, and contains a semver-valid version
1. Calculate the next version, depending on which version is current (in package.json) and the series to be used
1. Discover all the files in the current directory (and sub-directories) containing the current version string
1. Eliminate all the files set to be ignored in the .gitignore file
1. Eliminate the rest of the files set to be ignored in the .announcerc file (or the announce configuration)
1. Replace current version with the next version in the remaining files

##### CLI Options

Prepare Command Options:

| Option | Description |
| --- | --- |
| -ss, --series | Defines the "stage" in the "version ladder" to increment to. Default is "current", i.e., whichever stage the package is on right now |
| -vl, --version-ladder | Defines the "version ladder" to use. Will pick it from the .announcerc file if found. Default is dev => alpha => beta => rc => patch / minor / major => dev(next-version |
| -if, --ignore-folders | Comma-separated list of folders to ignore when checking for fils containing the current version string. Default is folders/files ignored in .gitignore |

Global Options inherited by the Prepare Command:

| Option | Description |
| --- | --- |
| -d, --debug | Turn debug mode on/off. Default is off. If turned on, use announce:prepare as the debug key |
| -s, --silent | Turns off all logs from the execution. If turned on, overrides the "quiet" option. Default is false. |
| -q, --quiet | Reduces logging to a bare minimum. Overridden by the "silent" option, if that is enabled. Default is false. |
| -h, --help | Displays this information. |

##### Configuration (.announcerc file)

```
{
    'prepare': {
        'series': 'series to use when incrementing', // Options are current, next, patch, minor, major [default: current]
        'versionLadder': 'version ladder to use for defining the series', // String defining the version ladder [default: 'dev, alpha, beta, rc, patch, minor, major']
        'ignoreFolders': 'list of folders to ignore', // Comma-separated list of folders to ignore when checking for files containing the current version string [default: .gitignore folders/files]

        'debug': true/false, // Enable debug logging as announce:prepare if enabled [default: false]
        'silent': true/false, // Enable silent mode - turn off logging to the logger passed into the object - overrides "quiet" option [default: false]
        'quiet': true/false // Enable quiet mode - reduce logging to the logger passed into the object [default: false]
    }
}
```

##### Invoking via API

The prepare command can be integrated into another module, and invoked as:

```
const announce = require('@twyr/announce);
announce.prepare({
    'series': 'series to use when incrementing', // Options are current, next, patch, minor, major [default: current]
    'versionLadder': 'version ladder to use for defining the series', // String defining the version ladder [default: 'dev, alpha, beta, rc, patch, minor, major']
    'ignoreFolders': 'list of folders to ignore', // Comma-separated list of folders to ignore when checking for files containing the current version string [default: .gitignore folders/files]

    'debug': true/false, // Enable debug logging as announce:prepare if enabled [default: false]
    'silent': true/false, // Enable silent mode - turn off logging to the logger passed into the object - overrides "quiet" option [default: false]
    'quiet': true/false // Enable quiet mode - reduce logging to the logger passed into the object [default: false]
}, logger);
```
