/**
 * Utility functions to format errors.
 */

var _s = require('underscore.string');


/**
 * Get a output line for an error in UNIX format.
 */
var getUnixErrorOutput = function(filename, error) {
    var line = '';

    if (error.tocken) {
        line = _s.sprintf('%d', error.token.lineNumber);
    }

    var errorCode = _s.sprintf('%04d', error.code);
    return _s.sprintf('%s:%s:(%s) %s',
            filename, line, errorCode, error.message);
};


/**
 * Get a output line for an error in regular format.
 */
var getErrorOutput = function(error) {
    var line = '';

    if (error.tocken) {
        line = _s.sprintf('Line %d', error.token.lineNumber);
    }

    var errorCode = _s.sprintf('E:%04d', error.code);

    return _s.sprintf('%s%s:%s', line, errorCode, error.message);
};


exports.getUnixErrorOutput = getUnixErrorOutput;
exports.getErrorOutput = getErrorOutput;