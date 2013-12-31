var _ = require('underscore');
var _s = require('underscore.string');
var ecmaLintRules = require('./ecmalintrules');
var errors = require('./errors');

var EcmaScriptLintRules = ecmaLintRules.EcmaScriptLintRules;

var JavaScriptLintRules = function(namespacesInfo) {
    EcmaScriptLintRules.call(this);
};

_.extend(JavaScriptLintRules.prototype, EcmaScriptLintRules.prototype);


/**
 * Handle errors associated with a parameter missing a param tag.
 * @param {Token} token
 * @param {string} paramName
 */
JavaScriptLintRules.prototype.handleMissingParameterDoc =
        function(token, paramName) {
    this._handleError(errors.Errors.MISSING_PARAMETER_DOCUMENTATION,
            _s.sprintf('Missing docs for parameter: "%s"', paramName),
            token);
};


JavaScriptLintRules.prototype.getLongLineExceptions = function() {
    return [
        /goog\.require\(.+\);?\s*$/,
        /goog\.provide\(.+\);?\s*$/,
        /[\s/*]*@visibility\s*{.*}[\s*/]*$/];
};


exports.JavaScriptLintRules = JavaScriptLintRules;
