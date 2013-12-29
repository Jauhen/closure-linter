
var program = require('commander');
var _ = require('underscore');

var aliasPass = require('./aliaspass');
var checkerBase = require('./checkerbase');
var closurizedNamespacesInfo = require('./closurizednamespacesinfo');
var javascriptLintRules = require('./javascriptlintrules');


/**
 * Checker that applies JavaScriptLintRules.
 *
 * @param {StateTracker} stateTracker State tracker.
 * @param {ErrorHandler} errorHander Error handler to pass all errors to.
 * @constructor
 * @inherit {checkerBase.CheckerBase}
 */
var JavaScriptStyleChecker = function(stateTracker, errorHander) {
    this._namespacesInfo = null;
    this._aliasPass = null;
    if (program.closurized_namespaces) {
        this._namespacesInfo =
                new closurizedNamespacesInfo.ClosurizedNamespacesInfo(
                        program.closurized_namespaces,
                        program.ignored_extra_namespaces);

        this._aliasPass = new aliasPass.AliasPass(program.closurized_namespaces,
            errorHander);
    }

    checkerBase.CheckerBase.call(this, errorHander,
            new javascriptLintRules.JavaScriptLintRules(this._namespacesInfo),
            stateTracker);
};

_.extend(JavaScriptStyleChecker.prototype, checkerBase.CheckerBase.prototype);


/**
 * Checks a token stream for lint warnings/errors.
 *
 * Adds a separate pass for computing dependency information based on
 * goog.require and goog.provide statements prior to the main linting pass.
 *
 * @param {Token} startToken The first token in the token stream.
 * @param {boolean} opt_limitedDocChecks Whether to perform limited checks.
 * @param {boolean} opt_isHtml Whether this token stream is HTML.
 * @param {?Token} opt_stopToken If given, checks should stop at this token.
 */
JavaScriptStyleChecker.prototype.check = function(startToken,
        opt_limitedDocChecks, opt_isHtml, opt_stopToken) {
    this._lintRules.initialize(this, opt_limitedDocChecks || false,
            opt_isHtml || false);

    if (this._aliasPass) {
        this._aliasPass.process(startToken);
    }

    // To maximize the amount of errors that get reported before a parse error
    // is displayed, don't run the dependency pass if a parse error exists.
    if (this._namespacesInfo) {
        this._namespacesInfo.reset();
        this._executePass(startToken, this._dependencyPass, opt_stopToken);
    }

    this._executePass(startToken, this._lintPass, opt_stopToken);

    // If we have a stop_token, we didn't end up reading the whole file and,
    // thus, don't call Finalize to do end-of-file checks.
    if (!opt_stopToken) {
        this._lintRules.finalize(this._stateTracker);
    }
};


/**
 * Processes an individual token for dependency information.
 *
 * Used to encapsulate the logic needed to process an individual token so that
 * it can be passed to _ExecutePass.
 * @param {Token} token The token to process.
 * @private
 */
JavaScriptStyleChecker.prototype._dependencyPass = function(token) {
    this._namespacesInfo.processToken(token, this._stateTracker);
};


exports.JavaScriptStyleChecker = JavaScriptStyleChecker;
