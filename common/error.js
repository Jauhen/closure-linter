/**
 * Error object commonly used in linters.
 */


/**
 * Object representing a style error.
 *
 * @param {number} code The numeric error code.
 * @param {string} message The error message string.
 * @param {?Object} opt_token Token where the error occurred.
 * @param {?Position} opt_position The position of the error within the token.
 * @param {?Object} opt_fixData Data to be used in autofixing.  Codes with
 *      fix_data are: GOOG_REQUIRES_NOT_ALPHABETIZED - List of string value
 *      tokens that are class names in goog.requires calls.
 * @constructor
 */
var Error = function(code, message, opt_token, opt_position, opt_fixData) {
    this.code = code;
    this.message = message;
    this.token = opt_token || null;
    this.position = opt_position || null;
    this.startIndex = this.token ? this.token.startIndex : 0;
    this.fixData = opt_fixData;
    if (this.position) {
        this.startIndex += this.position.start;
    }
};


/**
 * Compare two error objects, by source code order.
 *
 * @param {Error} a First error object.
 * @param {Error} b Second error object.
 * @return {number} A Negative/0/Positive number when a is before/the same
 *      as/after b.
 */
Error.compare = function(a, b) {
    var lineDiff = a.token.lineNumber - b.token.lineNumber;
    if (lineDiff) {
        return lineDiff;
    }

    return a.startIndex - b.startIndex;
};


exports.Error = Error;
