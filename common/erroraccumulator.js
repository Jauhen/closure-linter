/**
 * Linter error handler class that accumulates an array of errors.
 */


/**
 * Error handler object that accumulates errors in a list.
 * @constructor
 */
var ErrorAccumulator = function() {

    /** @type {Array.<Object>} */
    this._errors = [];
};


/**
 * Append the error to the list.
 * @param {Object} error The error object.
 */
ErrorAccumulator.prototype.handleError = function(error) {
    this._errors.push(error);
};


/**
 * Returns the accumulated errors.
 * @return {Array.<Object>} A sequence of errors.
 */
ErrorAccumulator.prototype.getErrors = function() {
    return this._errors;
};


ErrorAccumulator.prototype.handleFile = function(filename, firstToken) {};
ErrorAccumulator.prototype.finishFile = function() {};


exports.ErrorAccumulator = ErrorAccumulator;
