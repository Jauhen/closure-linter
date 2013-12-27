#!/usr/bin/env node

var program = require('commander');
var _ = require('underscore');
var _s = require('underscore.string');

var fileflags = require('./common/simplefileflags');
var errorAccumulator = require('./common/erroraccumulator');

var errorRecord = require('./lib/errorrecord');
var runner = require('./lib/runner');


/**
 * Run checkPath on all paths in one thread.
 *
 * @param {Array.<string>} paths Paths to check.
 */
var checkPaths = function(program, paths) {
    return _.flatten(_.map(paths, function(path) {
        return checkPath(program, path);
    }), true);
};


/**
 * Check a path and return any errors.
 *
 * @param {string} path Path to check.
 * @return {Array.<ErrorRecords>} A list of errorRecord.ErrorRecords for any
 *      found errors.
 */
var checkPath = function(program, path) {
    var errorHandler = new errorAccumulator.ErrorAccumulator();
    runner.run(program, path, errorHandler);

    return _.map(errorHandler.getErrors(), function(err) {
        return errorRecord.makeErrorRecord(program, path, err);
    });
};


/**
 * Generates list of suffixes for checked files.
 * @param {commander} program
 */
var generateSuffixes = function(program) {
    var suffixes = ['.js'];
    var extensions = [];

    if (program.extensions) {
        extensions = _.map(program.extensions,
            function(val) {
                if (val[0] === '.') {
                    return val;
                }
                return '.' + val;
            })
    }

    suffixes = suffixes.concat(extensions);
    if (program.html) {
        suffixes = suffixes.concat(['.html', '.htm']);
    }

    return suffixes;
}


var printFileSeparator = function(path) {
    console.log(_s.sprintf('----- FILE  :  %s -----', path));
}


/**
 * Print error records strings in the expected format.
 *
 * @param {Object} program
 * @param {Array.<ErrorRecord>} errorRecords
 */
var printErrorRecords = function(program, errorRecords) {
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
}


/**
 * Print a summary of the number of errors and files.
 */
var printSummary = function(paths, errorRecords) {
    var errorCount = errorRecords.length;
    var pathCount = paths.length;

    if (errorCount == 0) {
        console.log('%d files checked, no errors found.', pathCount);
    }

    var newErrorCount = _.filter(errorRecords, function(e) {
        return e.newError;}).length;

    var errorPaths = _.uniq(_.map(errorRecords, function(e) {
        return e.path;
    }));

    var errorPathsCount = errorPaths.length;
    var noErrorPathsCount = pathCount - errorPathsCount;

    if (errorCount || newErrorCount) {
        console.log('Found %d errors, including %d new errors, in %d files ' +
                '(%d files OK).', errorCount, newErrorCount, errorPathsCount,
                noErrorPathsCount);
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
    })
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
        parse(process.argv);

if (program.time) {
    console.time('Done in');
}

var paths = fileflags.getFileList(program, generateSuffixes(program));

var errorRecords = checkPaths(program, paths);

printErrorRecords(program, errorRecords);

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
