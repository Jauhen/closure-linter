
var errorRules = require('./errorrules');
var error = require('../common/error');


/**
 * Base class for all classes defining the lint rules for a language.
 * @constructor
 */
var LintRulesBase = function() {
    this._checker = null;
};


/**
 * Initializes to prepare to check a file.
 *
 * @param {CheckerBase} checker Class to report errors to.
 * @param {boolean} limitedDocChecks Whether doc checking is relaxed for this
 *      file.
 * @param {boolean} isHtml Whether the file is an HTML file with extracted
 *      contents.
 */
LintRulesBase.prototype.initialize = function(checker, limitedDocChecks,
                                              isHtml) {
    this._checker = checker;
    this._limitedDocChecks = limitedDocChecks;
    this._isHtml = isHtml;
};


/**
 * Call the HandleError function for the checker we are associated with.
 * @protected
 */
LintRulesBase.prototype._handleError = function(code, message, token,
                                                opt_position, opt_fixData) {
    if (errorRules.shouldReportError(code)) {
        this._checker.handleError(code, message, token, opt_position || null,
            opt_fixData ||null);
    }
};


/**
 * Sets whether doc checking is relaxed for this file.
 * @param {boolean} limitedDocChecks Whether doc checking is relaxed for this
 *      file.
 * @protected
 */
LintRulesBase.prototype._setLimitedDocChecks = function(limitedDocChecks) {
    this._limitedDocChecks = limitedDocChecks;
};


/**
 * Checks a token, given the current parser_state, for warnings and errors.
 * @param {Token} token The current token under consideration.
 * @param {StateTracker} parserState Object that indicates the parser state in
 *      the page.
 */
LintRulesBase.prototype.checkToken = function(token, parserState) {
    throw new TypeError('Abstract method CheckToken not implemented.');
};


/**
 * Perform all checks that need to occur after all lines are processed.
 * @param {StateTracker} parserState State of the parser after parsing all
 *      tokens.
 */
LintRulesBase.prototype.finalize = function(parserState) {
    throw new TypeError('Abstract method Finalize not implemented');
};


/**
 * This class handles checking a LintRules object against a file.
 *
 * @param {ErrorHandler} errorHandler Object that handles errors.
 * @param {LintRules} lintRules LintRules object defining lint errors given
 *      a token and state_tracker object.
 * @param {StateTracker} stateTracker Object that tracks the current state in
 *      the token stream.
 * @constructor
 */
var CheckerBase = function(errorHandler, lintRules, stateTracker) {
    this._errorHandler = errorHandler;
    this._lintRules = lintRules;
    this._stateTracker = stateTracker;

    this._hasErrors = false;
};


/**
 * Prints out the given error message including a line number.
 *
 * @param {number} code The error code.
 * @param {string} message The error to print.
 * @param {Token} token The token where the error occurred, or null if it was
 *      a file-wide issue.
 * @param {Position} opt_position The position of the error, defaults to null.
 * @param {Object} opt_fixData Metadata used for fixing the error.
 */
CheckerBase.prototype.handleError = function(code, message, token, opt_position,
        opt_fixData) {
    this._hasErrors = true;
    this._errorHandler.handleError(
            new error.Error(code, message, token, opt_position, opt_fixData));
};


/**
 * Returns true if the style checker has found any errors.
 * @return {boolean} True if the style checker has found any errors.
 */
CheckerBase.prototype.hasErrors = function() {
    return this._hasErrors;
};


/**
 * Checks a token stream, reporting errors to the error reporter.
 *
 * @param {Token} startToken First token in token stream.
 * @param {boolean} opt_limitedDocChecks Whether doc checking is relaxed for
 *      this file.
 * @param {boolean} opt_isHtml Whether the file being checked is an HTML file
 *      with extracted contents.
 * @param {?Token} opt_stopToken If given, check should stop at this token.
 */
CheckerBase.prototype.check = function(startToken, opt_limitedDocChecks,
                                       opt_isHtml, opt_stopToken) {
    this._lintRules.initialize(opt_limitedDocChecks, opt_isHtml);
    this._executePass(startToken, this._lintPass, opt_stopToken);
    this._lintRules.finalize(this._stateTracker);
};


/**
 * Checks an individual token for lint warnings/errors.
 *
 * Used to encapsulate the logic needed to check an individual token so that it
 * can be passed to _ExecutePass.
 * @param {Token} token The token to check.
 * @protected
 */
CheckerBase.prototype._lintPass = function(token) {
    this._lintRules.checkToken(token, this._stateTracker);
};


/**
 * Calls the given function for every token in the given token stream.
 *
 * As each token is passed to the given function, state is kept up to date and,
 * depending on the error_trace flag, errors are either caught and reported, or
 * allowed to bubble up so developers can see the full stack trace. If a parse
 * error is specified, the pass will proceed as normal until the token causing
 * the parse error is reached.
 * @param {Token} token The first token in the token stream.
 * @param {function(Token}} passFunction The function to call for each token in
 *      the token stream.
 * @param {Token} opt_stopToken The last token to check (if given).
 * @protected
 */
CheckerBase.prototype._executePass = function(token, passFunction,
                                              opt_stopToken) {
    this._stateTracker.reset();

    while (token) {
        //When we are looking at a token and decided to delete the whole line,
        // we will delete all of them in the "HandleToken()" below.  So the
        // current token and subsequent ones may already be deleted here.
        // The way we delete a token does not wipe out the previous and next
        // pointers of the deleted token.  So we need to check the token itself
        // to make sure it is not deleted.
        if (!token.isDeleted) {
            // End the pass at the stop token.
            if (token == opt_stopToken) {
                return;
            }

            this._stateTracker.handleToken(token,
                    this._stateTracker.getLastNonSpaceToken());

            passFunction.call(this, token);
            this._stateTracker.handleAfterToken(token);
        }

        token = token.next;
    }
};


exports.LintRulesBase = LintRulesBase;
exports.CheckerBase = CheckerBase;
