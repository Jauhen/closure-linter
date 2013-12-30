var program = require('commander');
var _ = require('underscore');
var errors = require('./errors');


var disabledErrorNums = [];

/**
 * Returns allowed maximum length of line.
 * @return {number} Length of line allowed without any warning.
 */
var getMaxLineLength = function() {
    return parseInt(program.max_line_length, 10);
};


/**
 * Whether the given error should be reported.
 * @param {number} error Error number;
 * @return {boolean} True for all errors except missing documentation errors
 *      and disabled errors.  For missing documentation, it returns the value
 *      of the jsdoc flag.
 */
var shouldReportError = function(error) {
    if (!disabledErrorNums) {
        if (program.disable) {
            _.each(program.disable, function(errorStr) {
                var errorNum = parseInt(errorStr, 10);
                if (!isNaN(errorNum)) {
                    disabledErrorNums.push(errorNum);
                }
            });
        }
    }

    var reportDocError = program.jsdoc || !_.contains([
            errors.Errors.MISSING_PARAMETER_DOCUMENTATION,
            errors.Errors.MISSING_RETURN_DOCUMENTATION,
            errors.Errors.MISSING_MEMBER_DOCUMENTATION,
            errors.Errors.MISSING_PRIVATE,
            errors.Errors.MISSING_JSDOC_TAG_THIS], error);

    var disabledError = !program.disable ||
            !_.contains(disabledErrorNums, error);

    return reportDocError && disabledError;
};


exports.getMaxLineLength = getMaxLineLength;
exports.shouldReportError = shouldReportError;
