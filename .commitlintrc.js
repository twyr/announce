module.exports = {
	'extends': ['@commitlint/config-conventional'],
	'rules': {
		'type-enum': [
			2,
			'always',
			[
				'build',
				'chore',
				'ci',
				'docs',
				'feat',
				'fix',
				'perf',
				'refactor',
				'revert',
				'style',
				'test',
				'wip'
			]
		],

		'body-max-length': [2, "always", Infinity]
	}
};
