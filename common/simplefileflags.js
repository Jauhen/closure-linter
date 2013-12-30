/**
 * Determines the list of files to be checked from command line arguments.
 */

var fs = require('fs');
var glob = require('glob');
var path = require('path');
var program = require('commander');
var _ = require('underscore');
var _s = require('underscore.string');


/**
 * Returns whether the given filename matches one of the given suffixes.
 *
 * @param {string} filename Filename to check.
 * @param {Array.<string>} suffixes Sequence of suffixes to check.
 * @return {boolean} Whether the given filename matches one of the given
 *      suffixes.
 */
var matchesSuffixes = function(filename, suffixes) {
    var suffix = filename.substr(filename.lastIndexOf('.'));
    return _.contains(suffixes, suffix);
};


/**
 * Returns files to be linted, specified directly on the command line.
 * Can handle the '*' wildcard in filenames, but no other wildcards.
 *
 * @param {Array.<string>} suffixes Expected suffixes for the file type being
 *      checked.
 * @return {Array.<string>} A sequence of files to be linted.
 * @private
 */
var _getUserSpecifiedFiles = function(suffixes) {
    var allFiles = [];

    _.each(program.args, function(f) {
        if (f.indexOf('*') != -1) {
            _.each(glob.sync(f, {mark: true}), function(result) {
                allFiles = _.union(allFiles, result);
            });
        } else {
            allFiles = _.union(allFiles, f);
        }
    });

    return _.filter(allFiles, function(f) {
        return matchesSuffixes(f, suffixes);
    });
};

/**
 * Returns files to be checked specified by the --recurse flag.
 *
 * @param {Array.<string>} suffixes Expected suffixes for the file type being
 *      checked.
 * @returns {Array.<string>} A list of files to be checked.
 * @private
 */
var _getRecursiveFiles = function(suffixes) {
    var lintFiles = [];

    function getFiles(dir) {
        var files = fs.readdirSync(dir);
        _.each(files, function(file) {
            var name = dir + '/' + file;
            if (fs.statSync(name).isDirectory()) {
                getFiles(name);
            } else {
                if (matchesSuffixes(name, suffixes)) {
                    lintFiles.push(name);
                }
            }
        });
    }

    getFiles(process.cwd());

    return lintFiles;
};


/**
 * @export
 * Returns all files specified by the user on the commandline.
 *
 * @param {Array.<string>} suffixes Expected suffixes for the file type.
 * @return {Array.<string>} A list of all files specified directly or indirectly
 *      (via flags) on the command line by the user.
 */
var getAllSpecifiedFiles = function(suffixes) {
    var files = _getUserSpecifiedFiles(suffixes);
    if (program.recurse) {
        files = files.concat(_getRecursiveFiles(suffixes));
    }
    return filterFiles(files);
};


/**
 * @export
 * Filters the list of files to be linted be removing any excluded files.
 * Filters out files excluded using --exclude_files and  --exclude_directories.
 *
 * @param {Array.<string>} files Sequence of files that needs filtering.
 * @return {Array.<string>} Filtered list of files to be linted.
 */
var filterFiles = function(files) {
    var numFiles = files.length;
    var ignoreDirsRegexs = _.map(program.exclude_directories, function(val) {
        return new RegExp(_s.sprintf('(^|[\\/])%s[\\/]', val));
    });

    var resultFiles = _.filter(files, function(f) {
        var addFile = _.every(program.exclude_files, function(name) {
            return !_s.endsWith(f, '/' + name) && f != name;
        });

        addFile = addFile && _.every(ignoreDirsRegexs, function(regex) {
            return !regex.test(f);
        });

        return addFile;
    });

    resultFiles = _.map(resultFiles, function(f) {
        return path.resolve(process.cwd(), f);
    });

    var skipped = numFiles - resultFiles.length;
    if (skipped) {
        console.log(_s.sprintf('Skipping %d file(s).', skipped));
    }

    return _.uniq(resultFiles);
};


/**
 * @export
 * Parse the flags and return the list of files to check.
 *
 * @param {Array.<string>} suffixes Sequence of acceptable suffixes for the
 *      file type.
 * @return {Array.<string>} The list of files to check.
 */
var getFileList = function(suffixes) {
    return getAllSpecifiedFiles(suffixes).sort();
};


exports.getFileList = getFileList;
