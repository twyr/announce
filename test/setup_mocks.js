'use strict';

/* eslint-disable security/detect-non-literal-require */
const path = require('path');

// INFO: THIS IS ABSOLUTELY CRITICAL - Needs to be done!!
require.main.filename = path.join(__dirname, '../index.js');

global.twyrEnv = (process.env.NODE_ENV || 'development').toLocaleLowerCase();

const SERVER_NAME = process.env.SERVER_NAME || 'Twyr/Announce';
process.title = SERVER_NAME;

global.snooze = async (ms) => {
	const Promise = require('bluebird');
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
};

const _setupFn = function(callback) {
	if(callback) callback();
};

const _teardownFn = function(callback) {
	if(callback) callback();
};

const prepare = require('mocha-prepare'); // eslint-disable-line node/no-unpublished-require
prepare(_setupFn, _teardownFn);
