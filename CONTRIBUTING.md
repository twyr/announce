#### Installation
```
git clone git+ssh://github.com/twyr/announce
cd announce
npm i && npm up
```


#### Generating your GPG Key
[Managing commit signature verification](https://help.github.com/en/github/authenticating-to-github/managing-commit-signature-verification)


#### Setting up Git VCS configuration
```
git config commit.gpgsign true`

git config trailer.sign.key "\nSigned-off-by: "
git config trailer.sign.ifmissing add
git config trailer.sign.ifexists doNothing
git config trailer.sign.command 'echo "$(git config user.name) <$(git config user.email)>"'

git config user.name "YOUR NAME"
git config user.email "your.name@twyr.com"
git config user.signingKey "GPG Key Id"
```


#### Linting
* `npm run lint`


#### Collecting (mostly useless) Statistics
* `npm run stats`


#### Running tests
* `npm run test`


#### Generating documentation
* `npm run docs`


#### Building: The whole shebang
* `npm run build`
