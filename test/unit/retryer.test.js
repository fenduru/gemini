'use strict';

var sinon = require('sinon'),
    assert = require('chai').assert,
    q = require('q'),
    fs = require('q-io/fs'),
    _ = require('lodash'),
    pool = require('../../lib/browser-pool'),
    createSuite = require('../../lib/suite').create,
    flatSuites = require('../../lib/suite-util').flattenSuites,

    CaptureSession = require('../../lib/capture-session'),
    Image = require('../../lib/image'),
    State = require('../../lib/state'),
    Retryer = require('../../lib/retryer'),
    Config = require('../../lib/config');

describe('Retryer', function() {
    function createBrowser(id) {
        /*jshint validthis:true */
        return {
            id: id,
            createActionSequence: this.sinon.stub().returns({
                perform: this.sinon.stub().returns(q.resolve()),
                getPostActions: this.sinon.stub().returns(null)
            }),

            captureFullscreenImage: this.sinon.stub().returns(q({
                getSize: this.sinon.stub().returns({}),
                crop: this.sinon.stub().returns(q({}))
            })),

            prepareScreenshot: this.sinon.stub().returns(q({
                captureArea: {},
                viewportOffset: {},
                ignoreAreas: []
            })),

            config: {
                getScreenshotPath: this.sinon.stub().returns(id)
            },

            openRelative: this.sinon.stub().returns(q.resolve()),
            quit: this.sinon.stub().returns(q.resolve())
        };
    }

    function createConfig(browsers) {
        var geminiOpts = {
            system: {
                projectRoot: '/'
            },
            rootUrl: 'http://example.com',
            gridUrl: 'http://grid.example.com',
            browsers: {}
        };

        browsers.forEach(function(browser) {
            geminiOpts.browsers[browser.id] = {
                desiredCapabilities: {}
            };
        });

        return new Config(geminiOpts);
    }

    beforeEach(function() {
        this.sinon = sinon.sandbox.create();

        this.init_ = function(opts) {
            var browserPool = {
                    getBrowser: this.sinon.stub(),
                    freeBrowser: this.sinon.stub().returns(q()),
                    finalizeBrowsers: this.sinon.stub().returns(q()),
                    cancel: this.sinon.stub()
                },
                browsers = _.reduce(opts.browsers, function(result, browserOpts, id) {
                    result.push(createBrowser.call(this, id));
                    return result;
                }, [], this),
                image = sinon.createStubInstance(Image);

            this.root = createSuite('root');

            this.suite = createSuite('suite', this.root);
            this.suite.id = 0;
            this.suite.url = '/path';
            this.suite.addState(new State(this.suite, 'state', function() {}));
            this.suite.retries = opts.retries;
            this.suite.browsers = _.keys(opts.browsers);

            image.save.returns(q.resolve());

            this.sinon.stub(CaptureSession.prototype, 'capture').returns(q({image: image}));
            this.sinon.stub(fs, 'exists').returns(true);

            this.sinon.stub(pool, 'create').returns(browserPool);

            this.sinon.stub(Image, 'compare');

            browsers.forEach(function(browser) {
                browserPool.getBrowser.withArgs(browser.id).returns(q(browser));
                Image.compare.withArgs(sinon.match.any, browser.id, sinon.match.any)
                    .returns(!opts.browsers[browser.id].hasDiff);
            });

            this.retryer = new Retryer(createConfig(browsers));
        };

        this.runSuites_ = function(initResult) {
            return this.retryer.run(flatSuites(this.root));
        };
    });

    afterEach(function() {
        this.sinon.restore();
    });

    it('should not perform retry if no suites has wrong diff', function() {
        var onRetry = this.sinon.spy().named('onRetry');

        this.init_({
            browsers: {
                browser: {hasDiff:false}
            },
            retries: 1
        });

        this.retryer.on('retry', onRetry);

        return this.runSuites_().then(function() {
            assert.notCalled(onRetry);
        });
    });

    it('should not perform retry if suite has no retries', function() {
        var onRetry = this.sinon.spy().named('onRetry');

        this.init_({
            browsers: {
                browser: {hasDiff: false}
            },
            retries: 0
        });

        this.retryer.on('retry', onRetry);

        return this.runSuites_().then(function() {
            assert.notCalled(onRetry);
        });
    });

    it('should emit `retry` if suite has diff and retries', function() {
        var onRetry = this.sinon.spy().named('onRetry');

        this.init_({
            browsers: {
                browser: {hasDiff:true}
            },
            retries: 1
        });

        this.retryer.on('retry', onRetry);

        return this.runSuites_().then(function() {
            assert.called(onRetry);
        });
    });

    it('should pass info about compare attempt to callback', function() {
        var onRetry = this.sinon.spy().named('onRetry');

        this.init_({
            browsers: {
                browser: {hasDiff:true}
            },
            retries: 1
        });

        this.retryer.on('retry', onRetry);

        return this.runSuites_({
            hasDiff: true,
            retries: 1
        }).then(function() {
            var testInfo = onRetry.lastCall.args[0];

            ['attempt', 'retriesLeft', 'equal', 'suite', 'state', 'referencePath', 'currentPath', 'browserId',
                'sessionId'].forEach(function(key) {
                    assert.property(testInfo, key);
                });
        });
    });

    it('should retry suite in each browser where suite failed', function() {
        var onRetry = this.sinon.spy().named('onRetry');

        this.init_({
            browsers: {
                browser: {hasDiff: true},
                anotherBrowser: {hasDiff: false}
            },
            retries: 1
        });

        this.retryer.on('retry', onRetry);

        return this.runSuites_().then(function() {
            assert.calledOnce(onRetry);

            var onRetryData = onRetry.lastCall.args[0];

            assert.equal(onRetryData.browserId, 'browser');
        });
    });

    it('should retry suite as much times as suite has retries', function() {
        var onRetry = this.sinon.spy().named('onRetry');

        this.init_({
            browsers: {
                browser: {hasDiff: true}
            },
            retries: 10
        });

        this.retryer.on('retry', onRetry);

        return this.runSuites_().then(function() {
            assert(onRetry.callCount, 10);
        });
    });
});
