'use strict';

var _ = require('lodash'),
    Handlebars = require('handlebars'),
    q = require('q'),
    fs = require('q-io/fs'),
    path = require('path'),

    hasFails = require('./view-model').hasFails,
    hasWarnings = require('./view-model').hasWarnings,
    REPORT_DIR = require('./lib').REPORT_DIR,

    makeOutFilePath = _.partial(path.join, REPORT_DIR);

Handlebars.registerHelper('status', function() {
    if (this.retry) {
        return 'section_status_retry';
    }

    if (this.skipped) {
        return 'section_status_skip';
    }

    if (hasFails(this)) {
        return 'section_status_fail';
    }

    if (hasWarnings(this)) {
        return 'section_status_warning';
    }

    return 'section_status_success';
});

Handlebars.registerHelper('has-fails', function() {
    return this.failed > 0? 'summary__key_has-fails' : '';
});

Handlebars.registerHelper('image', function(kind) {
    return new Handlebars.SafeString('<img data-src="' + encodeURI(this[kind + 'Path']) + '">');
});

/*jshint maxparams:false*/
//jscs: disable
Handlebars.registerHelper('ifCond', function(v1, operator, v2, options) {
    switch (operator) {
        case '===':
            return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '<':
            return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=':
            return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>':
            return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=':
            return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        case '&&':
            return (v1 && v2) ? options.fn(this) : options.inverse(this);
        case '||':
            return (v1 || v2) ? options.fn(this) : options.inverse(this);
        default:
            return options.inverse(this);
    }
});
//jscs: enable

function loadTemplate(name) {
    return fs.read(path.join(__dirname, name));
}

function copyToReportDir(fileName) {
    return fs.copy(path.join(__dirname, fileName), makeOutFilePath(fileName));
}

module.exports = {
    /**
     * @param {ViewModelResult} model
     * returns {Promise}
     */
    createHtml: function(model) {
        return q.all([
            loadTemplate('suite.hbs'),
            loadTemplate('report.hbs')
        ])
             .spread(function(suiteTemplate, reportTemplate) {
                Handlebars.registerPartial('suite', suiteTemplate);

                return Handlebars.compile(reportTemplate)(model);
            });
    },

    /**
     * @param {String} html
     * returns {Promise}
     */
    save: function(html) {
        return fs.makeTree(REPORT_DIR)
            .then(function() {
                return q.all([
                    fs.write(makeOutFilePath('index.html'), html),
                    copyToReportDir('report.js'),
                    copyToReportDir('report.css')
                ]);
            });
    }
};
