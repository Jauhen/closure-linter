/**
 * A simple, pickle-serializable class to represent a lint error.
 */

var program = require('commander');
var errors = require('./errors');
var errorOutput = require('../common/erroroutput');


/**
 * Record-keeping struct that can be serialized back from a process.
 *
 * @param {string} path Path to the file.
 * @param {string} errorString Error string for the user.
 * @constructor
 */
var ErrorRecord = function(path, errorString) {
    this.path = path;
    this.errorString = errorString;
};


/**
 * Make an error record with correctly formatted error string.
 *
 * Errors are not able to be serialized (pickled) over processes because of
 * their pointers to the complex token/context graph.  We use an intermediary
 * serializable class to pass back just the relevant information.
 *
 * @param {string} path Path of file the error was found in.
 * @param {string} error An error.Error instance.
 * @return {ErrorRecord} ErrorRecord instance.
 * @constructor
 */
var makeErrorRecord = function(path, error) {
    if (program.unix_mode) {
        var errorString = errorOutput.getUnixErrorOutput(path, error);
    } else {
        errorString = errorOutput.getErrorOutput(error);
    }

    return new ErrorRecord(path, errorString);
};


exports.ErrorRecord = ErrorRecord;
exports.makeErrorRecord = makeErrorRecord;
