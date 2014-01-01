/**
 * Methods for checking JS files for common style guide violations.
 *
 * These style guide violations should only apply to JavaScript and not an Ecma
 * scripting languages.
 */

var _ = require('underscore');
var _s = require('underscore.string');
var ecmaLintRules = require('./ecmalintrules');
var errors = require('./errors');
var errorCheck = require('./errorcheck');
var javascriptTokens = require('./javascripttokens');
var tokenUtil = require('./tokenutil');


var EcmaScriptLintRules = ecmaLintRules.EcmaScriptLintRules;
var Rule = errorCheck.Rule;
var Type = javascriptTokens.JavaScriptTokenType;


/**
 * JavaScript lint rules that catch JavaScript specific style errors.
 * @param {ClosurizedNamespacesInfo} namespacesInfo
 * @constructor
 * @extends {EcmaScriptLintRules}
 */
var JavaScriptLintRules = function(namespacesInfo) {
    EcmaScriptLintRules.call(this);

    this._namespacesInfo = namespacesInfo;
    this._declaredPrivateMemeberTokens = {};
    this._declaredPrivateMemebers = [];
    this._usedPrivateMembers = [];
    //A stack of dictionaries, one for each function scope entered. Each
    // dictionary is keyed by an identifier that defines a local variable and
    // has a token as its value.
    this._unusedLocalVariablesByScope = [];
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


/**
 * Check whether the given token contains a record type.
 * @param {Token} token The token being checked.
 * @return {boolean} True if the token contains a record type, False otherwise.
 */
JavaScriptLintRules.prototype._containsRecordType = function(token) {
    // If we see more than one left-brace in the string of an annotation token,
    // then there's a record type in there.
    return (!!token && token.type == Type.DOC_FLAG &&
            !!token.attachedObject.type &&
            token.attachedObject.type.indexOf('{') !=
                    token.attachedObject.type.lastIndexOf('{'))
};


/**
 * Checks a token, given the current parser_state, for warnings and errors.
 * @param {Token} token The current token under consideration.
 * @param {StateTracker} state Object that indicates the current state in
 *      the page.
 */
JavaScriptLintRules.prototype.checkToken = function(token, state) {
    // For @param don't ignore record type.
    if (this._containsRecordType(token) &&
            token.attachedObject.flagType != 'param') {
        // We should bail out and not emit any warnings for this annotation.
        // TODO(nicksantos): Support record types for real.
        state.getDocComment().invalidate();
        return;
    }

    // Call the base class's CheckToken function.
    EcmaScriptLintRules.prototype.checkToken.call(this, token, state);

    // Store some convenience variables.
    var namespacesInfo = this._namespacesInfo;

    if (errorCheck.shouldCheck(Rule.UNUSED_LOCAL_VARIABLES)) {
        this._checkUnusedLocalVariables(token, state);
    }

    if (errorCheck.shouldCheck(Rule.UNUSED_PRIVATE_MEMBERS)) {
        // Find all assignments to private members.
        if (token.type == Type.SIMPLE_LVALUE) {
            var identifier = token.string;
            if (_s.endsWith(identifier, '_') &&
                    !_s.endsWith(identifier, '__')) {
                var docComment = state.getDocComment();
                var suppressed = (docComment &&
                        docComment.hasFlag('suppress') && (
                        docComment.getFlag('suppress').type == 'undescore' ||
                        docComment.getFlag('suppress').type ==
                                'unusedPrivateMembers'));
                if (!suppressed) {
                    // Look for static members defined on a provided namespace.
                    if (namespacesInfo) {
                        var namespace = namespacesInfo.getClosurizedNamespace(
                                identifier);
                        var providedNamespaces =
                                namespacesInfo.getProvidedNamespaces();
                    } else {
                        namespace = null;
                        providedNamespaces = [];
                    }

                    // Skip cases of this.something_.somethingElse_.
                    var regex = /^this\.[a-zA-Z_]+$/;
                    if (_.contains(providedNamespaces, namespace) ||
                            regex.test(identifier)) {
                        var variable = _.last(identifier.split('.'));
                        this._declaredPrivateMemeberTokens[variable] = token;
                        this._declaredPrivateMemebers.push(variable);
                    }
                }
            } else if (!_s.endsWith(identifier)) {
                // Consider setting public members of private members to be
                // a usage.
                _.each(identifier.split('.'), function(piece) {
                    if (_s.endsWith(piece, '_')) {
                        this._usedPrivateMembers.push(piece);
                    }
                }, this);
            }
        }

        // Find all usages of private members.
        if (token.type == Type.IDENTIFIER) {
            _.each(token.string.split('.'), function(piece) {
                if (_s.endsWith(piece, '_')) {
                    this._usedPrivateMembers.push(piece);
                }
            }, this);
        }
    }

    if (token.type == Type.DOC_FLAG) {
        var flag = token.attachedObject;

        if (flag.flagType == 'param' && flag.nameToken != null) {
            this._checkForMissingSpaceBeforeToken(
                    token.attachedObject.nameToken);

            if (flag.type != null && flag.name != null) {
                if (errorCheck.shouldCheck(Rule.VARIABLE_ARG_MARKER)) {
                    // Check for variable arguments marker in type.
                    if (_s.startsWith(flag.type, '...') &&
                            flag.name != 'var_args') {
                        this._handleError(
                                errors.Errors.JSDOC_MISSING_VAR_ARGS_NAME,
                                _s.sprintf('Variable length argument %s must' +
                                        ' be renamed to var_args.', flag.name),
                                token);
                    } else if (!_s.startsWith(flag.type, '...') &&
                            flag.name == 'var_args') {
                        this._handleError(
                                errors.Errors.JSDOC_MISSING_VAR_ARGS_TYPE,
                                _s.sprintf('Variable length argument %s type' +
                                        ' must start with \'...\'.', flag.name),
                                        token);
                    }
                }

                if (errorCheck.shouldCheck(Rule.OPTIONAL_TYPE_MARKER)) {
                    // Check for optional marker in type.
                    if (_s.endsWith(flag.type, '=') &&
                            !_s.startsWith(flag.name, 'opt_')) {
                        this._handleError(
                                errors.Errors.JSDOC_MISSING_OPTIONAL_PREFIX,
                                _s.sprintf('Optional parameter name %s must' +
                                        ' be prefixed with opt_.', flag.name),
                                token);
                    } else if (!_s.endsWith(flag.type, '=') &&
                            _s.startsWith(flag.name, 'opt_')) {
                        this._handleError(
                                errors.Errors.JSDOC_MISSING_OPTIONAL_TYPE,
                                _s.sprintf('Optional parameter %s type must' +
                                        ' end with =.', flag.name),
                                token);
                    }
                }
            }
        }

        if (_.contains(state.getDocFlag().HAS_TYPE, flag.flagType)) {
            // Check for both missing type token and empty type braces '{}'
            // Missing suppress types are reported separately and we allow enums
            // and const without types.
            if (!_.contains(['suppress', 'enum', 'const'], flag.flagType) &&
                    (!flag.type || !flag.type.trim())) {
                this._handleError(errors.Errors.MISSING_JSDOC_TAG_TYPE,
                        _s.sprintf('Missing type in %s tag', token.string),
                        token);
            } else if (flag.nameToken && flag.typeEndToken &&
                    tokenUtil.compare(flag.typeEndToken, flag.nameToken) > 0) {
                this._handleError(errors.Errors.OUT_OF_ORDER_JSDOC_TAG_TYPE,
                        _s.sprintf('Type should be immediately after %s tag',
                                token.string), token);
            }
        }
    }
};


/**
 * Checks for unused local variables in function blocks.
 * @param {Token} token The token to check.
 * @param {StateTracker} state The state tracker.
 */
JavaScriptLintRules.prototype._checkUnusedLocalVariables =
        function(token, state) {
    // We don't use state.InFunction because that disregards scope functions.
    var inFunction = state.functionDepth() > 0;
    if (token.type == Type.SIMPLE_LVALUE || token.type == Type.IDENTIFIER) {
        if (inFunction) {
            var identifier = token.string;
            // Check whether the previous token was var.
            var previousCodeToken = tokenUtil.searchExcept(token,
                    Type.NON_CODE_TYPES, null, true);
            if (previousCodeToken && previousCodeToken.isKeyword('var')) {
                // Add local variable declaration to the top of the unused
                // locals stack.
                _.last(this._unusedLocalVariablesByScope)[identifier] = token;
            } else if (token.type == Type.IDENTIFIER) {
                // This covers most cases where the variable is used as
                // an identifier.
                this._markLocalVariableUsed(token);
            } else if (token.type == Type.SIMPLE_LVALUE &&
                    identifier.indexOf('.') != -1) {
                // This covers cases where a value is assigned to a property of
                // the variable.
                this._markLocalVariableUsed(token);
            }
        }
    } else if (token.type == Type.START_BLOCK) {
        if (inFunction && state.isFunctionOpen()) {
            // Push a new map onto the stack.
            this._unusedLocalVariablesByScope.push({});
        }
    } else if (token.type == Type.END_BLOCK) {
        if (state.isFunctionClose()) {
            // Pop the stack and report any remaining locals as unused.
            var unusedLocalVariables = this._unusedLocalVariablesByScope.pop();
            _.each(_.values(unusedLocalVariables), function(unusedToken) {
                this._handleError(errors.Errors.UNUSED_LOCAL_VARIABLE,
                        _s.sprintf('Unused local variable: %s.',
                                unusedToken.string), token);
            }, this);
        }
    }
};


/**
 * Marks the local variable as used in the relevant scope.
 *
 * Marks the local variable as used in the scope nearest to the current scope
 * that matches the given token.
 *
 * @param {Token} token The token representing the potential usage of a local
 *      variable.
 */
JavaScriptLintRules.prototype._markLocalVariableUsed = function(token) {
    var identifier = token.string.split('.')[0];

    _.find(this._unusedLocalVariablesByScope.reverse(),
            function(unusedLocalVariables) {
        if (_.contains(_.keys(unusedLocalVariables), identifier)) {
            delete unusedLocalVariables[identifier];
            return true;
        }
        return false;
    }, this);

    this._unusedLocalVariablesByScope.reverse();
};


JavaScriptLintRules.prototype.getLongLineExceptions = function() {
    return [
        /goog\.require\(.+\);?\s*$/,
        /goog\.provide\(.+\);?\s*$/,
        /[\s/*]*@visibility\s*{.*}[\s*/]*$/];
};


exports.JavaScriptLintRules = JavaScriptLintRules;
