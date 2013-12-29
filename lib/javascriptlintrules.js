var _ = require('underscore');
var ecmaLintRules = require('./ecmalintrules');

var EcmaScriptLintRules = ecmaLintRules.EcmaScriptLintRules;

var JavaScriptLintRules = function(namespacesInfo) {
    EcmaScriptLintRules.call(this);
};

_.extend(JavaScriptLintRules.prototype, EcmaScriptLintRules.prototype);


exports.JavaScriptLintRules = JavaScriptLintRules;
