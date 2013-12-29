/**
 * Utility functions to format errors.
 */

var _s = require('underscore.string');


/**
 * Get a output line for an error in UNIX format.
 */
var getUnixErrorOutput = function(filename, error) {
    var line = '';

    if (error.token) {
        line = _s.sprintf('%d', error.token.lineNumber);
    }

    var errorCode = error.code < 0 ? _s.sprintf('-%03d', -1 * error.code) :
            _s.sprintf('%04d', error.code);
    return _s.sprintf('%s:%s:(%s) %s',
            filename, line, errorCode, error.message);
};


/**
 * Get a output line for an error in regular format.
 */
var getErrorOutput = function(error) {
    var line = '';

    if (error.token) {
        line = _s.sprintf('Line %d, ', error.token.lineNumber);
    }

    var errorCode = error.code < 0 ? _s.sprintf('E:-%03d', -1 * error.code) :
            _s.sprintf('E:%04d', error.code);

    return _s.sprintf('%s%s:%s', line, errorCode, error.message);
};


exports.getUnixErrorOutput = getUnixErrorOutput;
exports.getErrorOutput = getErrorOutput;
