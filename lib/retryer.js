'use strict';

var inherit = require('inherit'),
    q = require('q'),
    _ = require('lodash'),

    Tester = require('./tester'),

    RunnerEvents = require('./constants/runner-events');

module.exports = inherit(Tester, {
    __constructor: function(config, options) {
        this.__base(config, options);
        this._retriesPerformed = 0;
        this._failedSuites = {};
    },

    _endTest: function(testResult) {
        testResult = _.extend(testResult, {attempt: this._retriesPerformed});

        if (!this._isNeedToRetryTest(testResult)) {
            return this.__base(testResult);
        }

        this._emitRetry(testResult);
        this._addFailedTest(testResult);
    },

    _endSession: function() {
        var _this = this;

        return this.__base().then(function() {
            var suitesToRetry = _this._flatFailedSuites();

            if (!suitesToRetry.length) {
                return q();
            }

            return _this._performRetry(suitesToRetry);
        });
    },

    _isNeedToRetryTest: function(testResult) {
        if (testResult.equal) {
            return false;
        }

        return testResult.suite.retries > this._retriesPerformed;
    },

    _emitRetry: function(testResult) {
        return this.emit(RunnerEvents.RETRY, _.extend(testResult, {
            retriesLeft: testResult.suite.retries - this._retriesPerformed
        }));
    },

    _addFailedTest: function(testResult) {
        var testInfo = this._failedSuites[testResult.suite.fullName];

        if (!testInfo) {
            this._failedSuites[testResult.suite.fullName] = this._buildFailedTestInfo(testResult);
        } else {
            testInfo.browsers.push(testResult.browserId);
        }
    },

    _buildFailedTestInfo: function(testResult) {
        return {
            suite: testResult.suite,
            browsers: [testResult.browserId]
        };
    },

    _flatFailedSuites: function() {
        if (_.isEmpty(this._failedSuites)) {
            return [];
        }

        return _.reduce(this._failedSuites, function(result, failedTestInfo) {
            var suite = failedTestInfo.suite;

            suite.browsers = failedTestInfo.browsers;
            result.push(suite);

            return result;
        }, []);
    },

    _performRetry: function(suitesToRetry) {
        this._failedSuites = {};
        this._retriesPerformed++;

        return this._runSession(suitesToRetry);
    }
});
