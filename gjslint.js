#!/usr/bin/env node

/**
 * Checks JavaScript files for common style guide violations.
 *
 * gjslint.js is designed to be used as a PRESUBMIT script to check for
 * javascript style guide violations.  As of now, it checks for the following
 * violations:
 *
 * * Missing and extra spaces
 * * Lines longer than 80 characters
 * * Missing newline at end of file
 * * Missing semicolon after function declaration
 * * Valid JsDoc including parameter matching
 *
 * Someday it will validate to the best of its ability against the entirety of
 * the JavaScript style guide.
 *
 * This file is a front end that parses arguments and flags.  The core of the
 * code is in tokenizer.js and checker.js.
 */


var program = require('commander');
var _ = require('underscore');
var _s = require('underscore.string');

var errorAccumulator = require('./common/erroraccumulator');
var fileFlags = require('./common/simplefileflags');

var errorCheck = require('./lib/errorcheck');
var errorRecord = require('./lib/errorrecord');
var runner = require('./lib/runner');

var Rule = errorCheck.Rule;


/**
 * Run checkPath on all paths in one thread.
 *
 * @param {Array.<string>} paths Paths to check.
 */
var checkPaths = function(paths) {
    return _.flatten(_.map(paths, function(path) {
        return checkPath(path);
    }), true);
};


/**
 * Check a path and return any errors.
 *
 * @param {string} path Path to check.
 * @return {Array.<ErrorRecord>} A list of errorRecord.ErrorRecords for any
 *      found errors.
 */
var checkPath = function(path) {
    var errorHandler = new errorAccumulator.ErrorAccumulator();
    runner.run(path, errorHandler);

    return _.map(errorHandler.getErrors(), function(err) {
        return errorRecord.makeErrorRecord(path, err);
    });
};


/**
 * Generates list of suffixes for checked files.
 */
var generateSuffixes = function() {
    var suffixes = ['.js'];
    var extensions = [];

    if (program.extensions) {
        extensions = _.map(program.extensions,
            function(val) {
                if (val[0] === '.') {
                    return val;
                }
                return '.' + val;
            });
    }

    suffixes = suffixes.concat(extensions);
    if (program.html) {
        suffixes = suffixes.concat(['.html', '.htm']);
    }

    return suffixes;
};


var printFileSeparator = function(path) {
    console.log(_s.sprintf('----- FILE  :  %s -----', path));
};


/**
 * Print error records strings in the expected format.
 *
 * @param {Array.<ErrorRecord>} errorRecords
 */
var printErrorRecords = function(errorRecords) {
    var currentPath = null;

    _.each(errorRecords, function(record) {
        if (currentPath != record.path) {
            currentPath = record.path;
            if (!program.unix_mode) {
                printFileSeparator(currentPath);
            }
        }
        console.log(record.errorString);
    });
};


/**
 * Print a summary of the number of errors and files.
 * @param {Array.<string>} paths
 * @param {Array.<ErrorRecord>} errorRecords
 */
var printSummary = function(paths, errorRecords) {
    var errorCount = errorRecords.length;
    var pathCount = paths.length;

    if (errorCount == 0) {
        console.log('%d files checked, no errors found.', pathCount);
    }

    var errorPaths = _.uniq(_.map(errorRecords, function(e) {
        return e.path;
    }));

    var errorPathsCount = errorPaths.length;
    var noErrorPathsCount = pathCount - errorPathsCount;

    if (errorCount) {
        console.log('Found %d errors in %d files (%d files OK).',
                errorCount, errorPathsCount, noErrorPathsCount);
    }
};

/**
 * Print a detailed summary of the number of errors in each file.
 */
var printFileSummary = function(paths, errorRecords) {
    _.each(paths, function(path) {
        var pathErrors = _.filter(errorRecords, function(e) {
            return e.path == path;
        });

        console.log('%s: %d', path, pathErrors.length);
    });
};


var list = function(val) {
    return _.filter(val.split(','), function(val) {
        return val;
    });
};


program.
        version('0.0.1').
        usage('[options] <file ...>').
        option('-U, --unix_mode',
                'Whether to emit warnings in standard unix format.', false).
        option('-B, --beep', 'Whether to beep when errors are found.', false).
        option('-T, --time', 'Whether to emit timing statistics.', false).
        option('-H, --html', 'Whether to check javascript in html files.',
                false).
        option('-S, --summary', 'Whether to show an error count summary.',
                false).
        option('-E, --extensions <extensions>',
                'List of additional file extensions (not .js) that should be ' +
                'treated as JavaScript files.', list).
        option('-R --recurse',
                'Recurse in to the subdirectories of the given path.', true).
        option('-D, --exclude_directories <directories>',
                'Exclude the specified directories (only applicable along ' +
                'with -R.', list, ['node_modules']).
        option('-X, --exclude_files <files>',
                'Exclude the specified files', list).
        option('-L, --limited_doc_files <files>',
                'List of files with relaxed documentation checks. Will not ' +
                'report errors for missing documentation, some missing ' +
                'descriptions, or methods whose @return tags don\'t have a ' +
                'matching return statement.', list, ['dummy.js', 'externs.js']).
        option('-E, --error_trace', 'Whether to show error exceptions.', false).
        option('-C, --closurized_namespaces <list>',
                'Namespace prefixes, used for testing of goog.provide/require',
                list).
        option('-I, --ignored_extra_namespaces <list>',
                'Fully qualified namespaces that should be not be reported ' +
                'as extra by the linter.', list).
        option('-d, --disable <list>',
                'Disable specific error. Usage Ex.: gjslint --disable 1,0011',
                list).
        option('-J, --jsdoc <b>',
                'Whether to report errors for missing JsDoc.', true).
        option('-M, --max_line_length <n>',
                'Maximum line length allowed without warning.', parseInt, 80).
        option('-s, --strict',
                'Whether to validate against the stricter Closure style. ' +
                'This includes ' + Rule.CLOSURE_RULES.join(', ') + '.',
                false).
        option('-l, --jslint_error <list>',
                'List of specific lint errors to check. Here is a list' +
                ' of accepted values:\n' +
                ' - ' + Rule.ALL + ': enables all following errors.\n' +
                ' - ' + Rule.BLANK_LINES_AT_TOP_LEVEL + ': validates' +
                'number of blank lines between blocks at top level.\n' +
                ' - ' + Rule.INDENTATION + ': checks correct ' +
                'indentation of code.\n' +
                ' - ' + Rule.WELL_FORMED_AUTHOR + ': validates the ' +
                '@author JsDoc tags.\n' +
                ' - ' + Rule.NO_BRACES_AROUND_INHERIT_DOC + ': ' +
                'forbids braces around @inheritdoc JsDoc tags.\n' +
                ' - ' + Rule.BRACES_AROUND_TYPE + ': enforces braces ' +
                'around types in JsDoc tags.\n' +
                ' - ' + Rule.OPTIONAL_TYPE_MARKER + ': checks correct ' +
                'use of optional marker = in param types.\n' +
                ' - ' + Rule.UNUSED_PRIVATE_MEMBERS + ': checks for ' +
                'unused private variables.\n',
                list).
        parse(process.argv);

if (program.time) {
    console.time('Done in');
}

var paths = fileFlags.getFileList(generateSuffixes());

var errorRecords = checkPaths(paths);

printErrorRecords(errorRecords);

printSummary(paths, errorRecords);

var exitCode = 0;

// If there are any errors.
if (errorRecords) {
    exitCode++;
}

// If there are any new errors.
if (_.filter(errorRecords, function(e) {return e.newError;})) {
    exitCode += 2;
}

if (exitCode) {
    if (program.summary) {
        printFileSummary(paths, errorRecords);
    }

    if (program.beep) {
        console.log('\007');
    }

    if (program.time) {
        console.timeEnd('Done in');
    }
}
