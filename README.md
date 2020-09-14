<h1 align="center">
    Announce
</h1>
<div align="center">
    <a href="https://spdx.org/licenses/MITNFA.html"><img src="https://img.shields.io/badge/License-MIT%20%2Bno--false--attribs-blue" /></a>
    <a href="https://github.com/twyr/announce/blob/main/CODE_OF_CONDUCT.md"><img src="https://img.shields.io/badge/Contributor%20Covenant-v2.0%20adopted-ff69b4.svg" /></a>
    <a href="https://circleci.com/gh/twyr/announce"><img src="https://circleci.com/gh/twyr/announce.svg?style=shield&circle-token=5b5a717014a209604624b6e25cee1552e6174315" /></a>
</div>
<hr />

<div align="center">
    node.js CLI for the most common workflow - Semantic Versioning, Tagging/Releasing on Github/Gitlab, and NPM Publishing
</div>
<div align="center">
    Built as part of the <a href="https://github.com/twyr">Twy&apos;r</a> effort by <a href="https://github.com/shadyvd">Vish Desai</a> and <a href="https://github.com/twyr/announce/graphs/contributors">contributors</a>
</div>
<hr />

| Category | Status  |
| --- | --- |
| Conventions | [![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-brightgreen.svg)](https://conventionalcommits.org) [![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/) |
| Code Stats | [![Languages](https://badgen.net/lgtm/langs/g/twyr/announce)](https://lgtm.com/projects/g/twyr/announce) ![GitHub repo size](https://img.shields.io/github/repo-size/twyr/announce) [![LoC](https://badgen.net/lgtm/lines/g/twyr/announce)](https://lgtm.com/projects/g/twyr/announce) [![Language grade](https://badgen.net/lgtm/grade/g/twyr/announce)](https://lgtm.com/projects/g/twyr/announce/context:javascript) [![Coverage Status](https://coveralls.io/repos/github/twyr/announce/badge.svg?branch=main)](https://coveralls.io/github/twyr/announce?branch=main) |
| Security | [![Dependabot](https://flat.badgen.net/dependabot/twyr/announce?icon=dependabot)](https://app.dependabot.com/accounts/twyr/repos/284440590) [![Known Vulnerabilities](https://snyk.io/test/github/twyr/announce/badge.svg?targetFile=package.json)](https://snyk.io/test/github/twyr/announce?targetFile=package.json) [![Total alerts](https://img.shields.io/lgtm/alerts/g/twyr/announce.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/twyr/announce/alerts/) |
|   |   |
| Development | ![GitHub commit activity](https://img.shields.io/github/commit-activity/m/twyr/announce) ![GitHub last commit](https://img.shields.io/github/last-commit/twyr/announce) |
| Issues | ![GitHub open issues](https://img.shields.io/github/issues-raw/twyr/announce) ![GitHub closed issues](https://img.shields.io/github/issues-closed-raw/twyr/announce) |
| Pull Requests | ![GitHub open prs](https://img.shields.io/github/issues-pr-raw/twyr/announce) ![GitHub closed prs](https://img.shields.io/github/issues-pr-closed-raw/twyr/announce) |
|   |   |
| Release Status | ![GitHub package.json version](https://img.shields.io/github/package-json/v/twyr/announce/main) ![GitHub tag (latest SemVer)](https://img.shields.io/github/v/tag/twyr/announce?sort=semver) ![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/twyr/announce?sort=semver) |
| Publish Status | ![node-current](https://img.shields.io/node/v/@twyr/announce) ![npm bundle size](https://img.shields.io/bundlephobia/min/@twyr/announce) ![npm](https://img.shields.io/npm/dy/@twyr/announce) |
|   |   |

#### TABLE OF CONTENTS
- [Raison d'etre](#why-announce)
- [Workflow](#workflow)
- [Using the CLI](#using-the-cli)
   - [Installation](#cli-installation)
   - [Commands](#cli-commands)
- [Integrating with another Module](#integrating-announce-into-another-module)
   - [Installation](#module-installation)
   - [API](#module-api)
- [Contributing](#contributing)
   - [Code of Conduct](#code-of-conduct)
   - [Developing](#developing)
   - [Project Contributors](#contributors)
- [License](#license)
- [See Also](#see-also)

#### WHY ANNOUNCE
Most node.js projects follow a fairly simple set of steps during development - bump the (semantic) version for the next release, commit code,
author a changelog, tag/release on Github/Gitlab (with release notes), and publish to the NPM Registry.

While there are several tools that help with each of these steps, they fall into one of two categories - they either perform only one of the steps,
or they try to do everything and end up being extremely complex. A good example of the first category of tool is [npm-version](https://docs.npmjs.com/cli/version),
which takes responsibility only for bumping up the versions, and nothing else. On the other hand, tools such as [semantic-release](https://www.npmjs.com/package/semantic-release)
provide functionality (via plugins) to push not only to NPM, but also several other registries/endpoints - see [semantic-release plugins](https://github.com/semantic-release/semantic-release/blob/HEAD/docs/extending/plugins-list.md)
for example.

For the [Twy'r Project](https://github.com/twyr), neither of these categories of tools is "exactly right" - they provide either too little,
or too much, functionality. The Announce CLI/Module tries to fill in that "sweet spot" - providing exactly the functionality required.

#### WORKFLOW
The [Twy'r Project](https://github.com/twyr) development/release workflow consists of the following steps:
1. Bump version as required
1. Create a changelog automatically before tagging
1. Generate release notes and create a Github/Gitlab release using the tag created in Step #2
1. Publish the release to NPM
1. Repeat for the next development/release cycle

Every repository in the project, including this CLI/Module, will adhere to this workflow going forward. The Announce module will be used
extensively to maintain the versioning, changelog, and release notes - as well as acting as a helper tool to publish to NPM as required.

#### USING THE CLI

##### CLI Installation
Assuming that node.js and npm have already been installed on the system, [Announce](https://github.com/twyr/announce) can be installed
via the following commands:

| Install Type | Command  |
| --- | --- |
| Local | npm install @twyr/announce --save-dev  |
| Global  | npm install @twyr/announce --global  |
|   |   |

##### CLI Commands
- [ ] TODO: Added along with the commands

#### INTEGRATING ANNOUNCE INTO ANOTHER MODULE

##### Module Installation
Assuming that node.js and npm have already been installed on the system, [Announce](https://github.com/twyr/announce) can be installed
via the following command: `npm install @twyr/announce --save-dev`

##### Module API
Once installed, the module may be loaded using:
```
const announce = require('@twyr/announce);
```

- [ ] TODO: Added along with the commands

#### CONTRIBUTING

##### Code of Conduct
All contributors to this project are expected to adhere to the [Code of Conduct](CODE_OF_CONDUCT.md) specified.

##### Developing
Details on getting the code, setting up the development environment, and instructions on how to extend/build/test the code are detailed in the
[Contribution Guide](CONTRIBUTING.md)

##### Contributors

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors)
<!-- ALL-CONTRIBUTORS-BADGE:END --> 

This project follows the [all-contributors](https://allcontributors.org) specification. Contributions of any kind are welcome!

#### LICENSE
This project is licensed under the [MIT +no-false-attribs](https://spdx.org/licenses/MITNFA.html) license.
You may get a copy of the license by following the link, or at [LICENSE.md](LICENSE.md)

#### SEE ALSO

| Command | Category | Alternatives on NPM  |
| --- | --- | --- |
| Prepare | Semantic Versioning | [npm-version](https://docs.npmjs.com/cli/version) |
| Release | Changelog Management | [changelog](https://www.npmjs.com/search?q=keywords:changelog) |
| Release | Tagging & Releasing | [release](https://www.npmjs.com/search?q=keywords:release) |
| Publish | Registry (NPM, et al) Publishing | [publish](https://www.npmjs.com/search?q=keywords:npm%20publish) |
|  |  |