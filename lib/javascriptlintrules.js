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
var javascriptTokenizer = require('./javascripttokenizer');
var position = require('../common/position');
var requireProvideSorter = require('./requireprovidesorter');
var tokenUtil = require('./tokenutil');


var EcmaScriptLintRules = ecmaLintRules.EcmaScriptLintRules;
var Position = position.Position;
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
 * @param {JavaScriptStateTracker} state Object that indicates the current
 *      state in the page.
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
                        docComment.getFlag('suppress').type == 'underscore' ||
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
    } else if (token.type == Type.DOUBLE_QUOTE_STRING_START) {
        var nextToken = token.next;
        while (nextToken.type == Type.STRING_TEXT) {
            if (javascriptTokenizer.JavaScriptTokenizer.SINGLE_QUOTE.test(
                    nextToken.string)) {
                break;
            }
            nextToken = nextToken.next;
        }
        if (!javascriptTokenizer.JavaScriptTokenizer.SINGLE_QUOTE.test(
                nextToken.string)) {
            this._handleError(errors.Errors.UNNECESSARY_DOUBLE_QUOTED_STRING,
                    'Single-quoted string preferred over double-quoted string.',
                    token, Position.all(token.string));
        }
    } else if (token.type == Type.END_DOC_COMMENT) {
        docComment = state.getDocComment();

        // When @externs appears in a @fileoverview comment, it should trigger
        // the same limited doc checks as a special filename like externs.js.
        if (docComment.hasFlag('fileoverview') &&
                docComment.hasFlag('externs')) {
            this._setLimitedDocChecks(true);
        }

        if (errorCheck.shouldCheck(Rule.BLANK_LINES_AT_TOP_LEVEL) &&
                !this._isHtml && state.inTopLevel() &&
                !state.inNonScopeBlock()) {

            // Check if we're in a fileoverview or constructor JsDoc.
            var isConstructor = docComment.hasFlag('constuctor') ||
                    docComment.hasFlag('interface');
            // @fileoverview is an optional tag so if the dosctring is the first
            // token in the file treat it as a file level docstring.
            var isFileLevelComment = docComment.hasFlag('fileoverview') ||
                    !docComment.startToken.previous;

            // If the comment is not a file overview, and it does not
            // immediately precede some code, skip it.
            // NOTE: The tokenutil methods are not used here because of their
            // behavior at the top of a file.
            nextToken = token.next;
            if (!nextToken || (!isFileLevelComment &&
                    _.contains(Type.NON_CODE_TYPES, nextToken.type))) {
                return;
            }

            // Don't require extra blank lines around suppression of extra
            // goog.require errors.
            if (docComment.suppressionOnly() &&
                    nextToken.type == Type.IDENTIFIER &&
                    _.contains(['goog.provide', 'goog.require'],
                            nextToken.string)) {
                return;
            }

            // Find the start of this block (include comments above the block,
            // unless this is a file overview).
            var blockStart = docComment.startToken;
            if (!isFileLevelComment) {
                token = blockStart.previous;
                while (token && _.contains(Type.COMMENT_TYPES, token.type)) {
                    blockStart = token;
                    token = token.previous;
                }
            }

            // Count the number of blank lines before this block.
            var blankLines = 0;
            token = blockStart.previous;
            while (token && _.contains([Type.WHITESPACE, Type.BLANK_LINE],
                    token.type)) {
                if (token.type == Type.BLANK_LINE) {
                    // A blank line.
                    blankLines++;
                } else if (token.type == Type.WHITESPACE &&
                        !token.line.trim()) {
                    // A line with only whitespace on it.
                    blankLines++;
                }
                token = token.previous;
            }

            // Log errors.
            var errorMessage = false;
            var expectedBlankLines = 0;

            // Only need blank line before file overview if it is not
            // the beginning of the file, e.g. copyright is first.
            if (isFileLevelComment && blankLines == 0 && blockStart.previous) {
                errorMessage = 'Should have a blank line before ' +
                        'a file overview.';
                expectedBlankLines = 1;
            } else if (isConstructor && blankLines != 3) {
                errorMessage = 'Should have 3 blank lines before ' +
                        'a constructor/interface.'
                expectedBlankLines = 3;
            } else if (!isFileLevelComment && !isConstructor &&
                    blankLines != 2) {
                errorMessage = 'Should have 2 blank lines between ' +
                        'top-level blocks.'
                expectedBlankLines = 2;
            }

            if (errorMessage) {
                this._handleError(errors.Errors.WRONG_BLANK_LINE_COUNT,
                        errorMessage, blockStart, Position.atBeginning(),
                        expectedBlankLines - blankLines);
            }
        }
    } else if (token.type == Type.END_BLOCK) {
        if (state.inFunction() && state.isFunctionClose()) {
            var isImmediatelyCalled = !!token.next &&
                    token.next.type == Type.START_PAREN;
            var jsFunction = state.getFunction();
            if (!this._limitedDocChecks) {
                if (jsFunction.hasReturn && jsFunction.doc &&
                        !isImmediatelyCalled &&
                        !jsFunction.doc.hasFlag('return') &&
                        !jsFunction.doc.inheritsDocumentation() &&
                        !jsFunction.doc.hasFlag('constructor')) {
                    // Check for proper documentation of return value.
                    this._handleError(
                            errors.Errors.MISSING_RETURN_DOCUMENTATION,
                            'Missing @return JsDoc in function with' +
                                    ' non-trivial return',
                            jsFunction.doc.endToken, Position.atBeginning());
                } else if (!jsFunction.hasReturn && !jsFunction.hasThrow &&
                        jsFunction.doc && jsFunction.doc.hasFlag('return') &&
                        !state.inInterfaceMethod()) {
                    var returnFlag = jsFunction.doc.getFlag('return');
                    if (returnFlag.type == null || _.isEmpty(_.intersection(
                            returnFlag.type.split('|'),
                            ['undefined', 'void', '*']))) {
                        this._handleError(
                                errors.Errors.UNNECESSARY_RETURN_DOCUMENTATION,
                                'Found @return JsDoc on function that' +
                                        ' returns nothing',
                                returnFlag.flagToken, Position.atBeginning());
                    }
                }
            }

            // Method in object literal definition of prototype can safely
            // reference 'this'.

            var prototypeObjectLiteral = false;
            var blockStart = null;
            var previousCode = null;
            var previousPreviousCode = null;

            // Search for cases where prototype is defined as object literal.
            //       previous_previous_code
            //       |       previous_code
            //       |       | block_start
            //       |       | |
            // a.b.prototype = {
            //   c : function() {
            //     this.d = 1;
            //   }
            // }

            // If in object literal, find first token of block so to find
            // previous tokens to check above condition.
            if (state.inObjectLiteral()) {
                blockStart = state.getCurrentBlockStart();
            }

            // If an object literal then get previous token (code type). For
            // above case it should be '='.
            if (blockStart) {
                previousCode = tokenUtil.searchExcept(blockStart,
                        Type.NON_CODE_TYPES, null, true);
            }

            // If previous token to block is '=' then get its previous token.
            if (previousCode && previousCode.isOperator('=')) {
                previousPreviousCode = tokenUtil.searchExcept(previousCode,
                        Type.NON_CODE_TYPES, null, true);
            }

            // If variable/token before '=' ends with '.prototype' then its
            // above case of prototype defined with object literal.
            prototypeObjectLiteral = !!previousPreviousCode &&
                    _s.endsWith(previousPreviousCode.string, '.prototype');

            if (jsFunction.hasThis && jsFunction.doc &&
                    !jsFunction.doc.hasFlag('this') &&
                    !jsFunction.isConstructor && !jsFunction.isInterface &&
                    !_s.contains(jsFunction.name, '.prototype.') &&
                    !prototypeObjectLiteral) {
                this._handleError(errors.Errors.MISSING_JSDOC_TAG_THIS,
                        'Missing @this JsDoc in function referencing "this".' +
                                ' (this usually means you are trying to' +
                                ' reference "this" in a static function, or' +
                                ' you have forgotten to mark a constructor' +
                                ' with @constructor)',
                        jsFunction.doc.endToken, Position.atBeginning());
            }
        }

    } else if (token.type == Type.IDENTIFIER) {
        if (token.string == 'goog.inherits' && !state.inFunction()) {
            if (state.getLastNonSpaceToken().lineNumber == token.lineNumber) {
                this._handleError(errors.Errors.MISSING_LINE,
                        'Missing newline between constructor and goog.inherits',
                        token, Position.atBeginning());
            }

            var extraSpace = state.getLastNonSpaceToken().next;
            while (extraSpace != token) {
                if (extraSpace.type == Type.BLANK_LINE) {
                    this._handleError(errors.Errors.EXTRA_LINE,
                            'Extra line between constructor and goog.inherits',
                            extraSpace);
                }
                extraSpace = extraSpace.next;
            }

            // TODO(robbyw): Test the last function was a constructor.
            // TODO(robbyw): Test correct @extends and @implements
            // documentation.
        } else if (token.string == 'goog.provide' && !state.inFunction() &&
                namespacesInfo != null) {
            var namespace = tokenUtil.getStringAfterToken(token);

            // Report extra goog.provide statement.
            if (!namespace || namespacesInfo.isExtraProvide(token)) {
                if (!namespace) {
                    var msg = 'Empty namespace in goog.provide';
                } else {
                    msg = 'Unnecessary goog.provide: ' +  namespace;

                    // Hint to user if this is a Test namespace.
                    if (_s.endsWith(namespace, 'Test')) {
                        msg += ' *Test namespaces must be mentioned in the ' +
                                'goog.setTestOnly() call'
                    }
                }

                this._handleError(errors.Errors.EXTRA_GOOG_PROVIDE, msg, token,
                        Position.atBeginning());
            }

            if (namespacesInfo.isLastProvide(token)) {
                // Report missing provide statements after the last existing
                // provide.
                var missingProvides = namespacesInfo.getMissingProvides();
                if (_.size(missingProvides)) {
                    this._reportMissingProvides(missingProvides,
                            tokenUtil.getLastTokenInSameLine(token).next,
                            false);
                }

                // If there are no require statements, missing requires should
                // be reported after the last provide.
                if (!namespacesInfo.getRequiredNamespaces()) {
                    var missingRequires = namespacesInfo.getMissingRequires();
                    if (_.size(missingRequires)) {
                        this._reportMissingRequires(missingRequires,
                                tokenUtil.getLastTokenInSameLine(token).next,
                                true);
                    }
                }
            }
        } else if (token.string == 'goog.require' && !state.inFunction() &&
                namespacesInfo != null) {
            namespace = tokenUtil.getStringAfterToken(token);

            // If there are no provide statements, missing provides should be
            // reported before the first require.
            if (namespacesInfo.isFirstRequire(token) &&
                    !namespacesInfo.getProvidedNamespaces()) {
                missingProvides = namespacesInfo.getMissingProvides();
                if (missingProvides) {
                    this._reportMissingProvides(missingProvides,
                            tokenUtil.getFirstTokenInSomeLine(token), true);
                }
            }

            // Report extra goog.require statement.
            if (!namespace || namespacesInfo.isExtraRequire(token)) {
                if (!namespace) {
                    msg = 'Empty namespace in goog.require';
                } else {
                    msg = 'Unnecessary goog.require: ' + namespace;
                }

                this._handleError(errors.Errors.EXTRA_GOOG_REQUIRE, msg,
                        token, Position.atBeginning());
            }

            // Report missing goog.require statements.
            if (namespacesInfo.isLastRequire(token)) {
                missingRequires = namespacesInfo.getMissingRequires();
                if (_.size(missingRequires)) {
                    this._reportMissingRequires(missingRequires,
                            tokenUtil.getLastTokenInSameLine(token).next,
                            false);
                }
            }
        }
    } else if (token.type == Type.OPERATOR) {
        var lastInLine = token.isLastInLine();
        // If the token is unary and appears to be used in a unary context
        // it's ok.  Otherwise, if it's at the end of the line or immediately
        // before a comment, it's ok.
        // Don't report an error before a start bracket - it will be reported
        // by that token's space checks.
        if (!token.metadata.isUnaryOperator() && !lastInLine &&
                !token.next.isComment() && !token.next.isOperator(',') &&
                !_.contains([Type.WHITESPACE, Type.END_PAREN, Type.END_BRACKET,
                    Type.SEMICOLON, Type.START_BRACKET], token.next.type)) {
            this._handleError(errors.Errors.MISSING_SPACE,
                    _s.sprintf('Missing space after "%s"', token.string),
                    token, Position.atEnd(token.string));
        }

    } else if (token.type == Type.WHITESPACE) {
        var firstInLine = token.isFirstInLine();
        lastInLine = token.isLastInLine();
        // Check whitespace length if it's not the first token of the line and
        // if it's not immediately before a comment.
        if (!lastInLine && !firstInLine && !token.next.isComment()) {
            // Ensure there is no space after opening parentheses.
            if (_.contains([Type.START_PAREN, Type.START_BRACKET,
                Type.FUNCTION_NAME], token.previous.type) ||
                    token.next.type == Type.START_PARAMETERS) {
                this._handleError(errors.Errors.EXTRA_SPACE,
                        _s.sprintf('Extra space after "%s"',
                                token.previous.string),
                        token, Position.all(token.string));
            }
        }
    } else if (token.type == Type.SEMICOLON) {
        var previousToken = tokenUtil.searchExcept(token, Type.NON_CODE_TYPES,
                null, true);
        if (!previousToken) {
            this._handleError(errors.Errors.REDUNDANT_SEMICOLON,
                    'Semicolon without any statement',
                    token, Position.atEnd(token.string));
        } else if (previousToken.type == Type.KEYWORD &&
                !_.contains(['break', 'continue', 'return'],
                        previousToken.string)) {
            this._handleError(errors.Errors.REDUNDANT_SEMICOLON,
                    _s.sprintf('Semicolon after "%s" without any statement.' +
                            ' Looks like an error.', previousToken.string),
                    token, Position.atEnd(token.string));
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


/**
 * Reports missing provide statements to the error handler.
 * @param {Object.<string: number>} missingProvides A dictionary of string(key)
 *      and integer(value) where each string(key) is a namespace that should be
 *      provided, but is not and integer(value) is first line number where
 *      it's required.
 * @param {Token} token The token where the error was detected (also where the
 *      new provides will be inserted.
 * @param {boolean} needBlankLine Whether a blank line needs to be inserted
 *      after the new provides are inserted. May be True, False, or None,
 *      where None indicates that the insert location is unknown.
 */
JavaScriptLintRules.prototype._reportMissingProvides = function(missingProvides,
        token, needBlankLine) {

    var missingProvidesMsg = 'Missing the following goog.provide statements:\n';
    missingProvidesMsg += '\n' + _.map(_.keys(missingProvides), function(x) {
                return _s.sprintf('goog.provide(\'%s\');', x);
            }).join('.');
    missingProvidesMsg += '\n';

    missingProvidesMsg += '\nFirst line where provided: \n';
    missingProvidesMsg += _.map(_.keys(missingProvides), function(x) {
                return _s.sprintf('  %s : line %d', x, missingProvides[x]);
            }).join('\n');
    missingProvidesMsg += '\n';

    this._handleError(errors.Errors.MISSING_GOOG_PROVIDE, missingProvidesMsg,
            token, Position.atBeginning(),
            [_.keys(missingProvides), needBlankLine]);
};


/**
 * Reports missing require statements to the error handler.
 * @param {Object.<string: number>} missingRequires A dictionary of string(key)
 *      and integer(value) where each string(key) is a namespace that should be
 *      required, but is not and integer(value) is first line number where it's
 *      required.
 * @param {Token} token The token where the error was detected (also where the
 *      new requires will be inserted.
 * @param {boolean} needBlankLines Whether a blank line needs to be inserted
 *      before the new requires are inserted. May be True, False, or None,
 *      where None indicates that the insert location is unknown.
 */
JavaScriptLintRules.prototype._reportMissingRequires = function(missingRequires,
        token, needBlankLines) {
    var missingRequiresMsg = 'Missing the following goog.require statements:\n';
    missingRequiresMsg += _.map(_.keys(missingRequires), function(x) {
                return _s.sprintf('goog.require(\'%s\');', x);
            }).join('\n');
    missingRequiresMsg += '\n';

    missingRequiresMsg += '\nFirst line where required: \n';
    missingRequiresMsg += _.map(_.keys(missingRequires), function(x) {
                return _s.sprintf('  %s : line %d', x, missingRequires[x]);
            }).join('\n');
    missingRequiresMsg += '\n';

    this._handleError(errors.Errors.MISSING_GOOG_REQUIRE, missingRequiresMsg,
            token, Position.atBeginning(),
            [_.keys(missingRequires), needBlankLines]);
};


/**
 * Perform all checks that need to occur after all lines are processed.
 */
JavaScriptLintRules.prototype.finalize = function(state) {
    // Call the base class's Finalize function.
    EcmaScriptLintRules.prototype.finalize.call(this, state);

    if (errorCheck.shouldCheck(Rule.UNUSED_PRIVATE_MEMBER)) {
        // Report an error for any declared private member that was never used.
        var unusedPrivateMembers = _.difference(this._declaredPrivateMemebers,
                this._usedPrivateMembers);

        _.each(unusedPrivateMembers, function(variable) {
            var token = this._declaredPrivateMemeberTokens[variable];
            this._handleError(errors.Errors.UNUSED_PRIVATE_MEMBER,
                    _s.sprintf('Unused private member: %s.', token.string),
                    token);
        }, this);

        // Clear state to prepare for the next file.
        this._declaredPrivateMemeberTokens = {};
        this._declaredPrivateMemebers = [];
        this._usedPrivateMembers = [];
    }

    var namespaceInfo = this._namespacesInfo;
    if (namespaceInfo != null) {
        // If there are no provide or require statements, missing provides and
        // requires should be reported on line 1.
        if (!namespaceInfo.getProvidedNamespaces() &&
                !namespaceInfo.getRequiredNamespaces()) {
            var missingProvides = namespaceInfo.getMissingProvides();
            if (_.size(missingProvides)) {
                this._reportMissingProvides(missingProvides,
                        state.getFirstToken(), false);
            }

            var missingRequires = namespaceInfo.getMissingRequires();
            if (_.size(missingRequires)) {
                this._reportMissingRequires(missingRequires,
                        state.getFirstToken(), false);
            }
        }
    }

    this._checkSortedRequiresProvides(state.getFirstToken());
};


/**
 * Checks that all goog.require and goog.provide statements are sorted.
 *
 * Note that this method needs to be run after missing statements are added to
 * preserve alphabetical order.
 * @param {Token} token The first token in the token stream.
 * @private
 */
JavaScriptLintRules.prototype._checkSortedRequiresProvides = function(token) {
    var sorter = new requireProvideSorter.RequireProvideSorter();
    var firstProvideToken = sorter.checkProvides(token);
    if (firstProvideToken) {
        var newOrder = sorter.getFixedProvideString(firstProvideToken);
        this._handleError(errors.Errors.GOOG_PROVIDES_NOT_ALPHABETIZED,
                'goog.provide classes must be alphabetized.  ' +
                        'The correct code is:\n' + newOrder,
                firstProvideToken, Position.atBeginning(), firstProvideToken);
    }

    var firstRequreToken = sorter.checkRequires(token);
    if (firstRequreToken) {
        newOrder = sorter.getFixedRequireString(firstRequreToken);
        this._handleError(errors.Errors.GOOG_REQUIRES_NOT_ALPHABETIZED,
                'goog.require classes must be alphabetized.  ' +
                        'The correct code is:\n' + newOrder,
                firstRequreToken, Position.atBeginning(), firstRequreToken);
    }
};


/**
 * Gets a list of regexps for lines which can be longer than the limit.
 * @return {Array.<RegExp>} A list of regexps, used as matches (rather
 *      than searches).
 */
JavaScriptLintRules.prototype.getLongLineExceptions = function() {
    return [
        /goog\.require\(.+\);?\s*$/,
        /goog\.provide\(.+\);?\s*$/,
        /[\s/*]*@visibility\s*{.*}[\s*/]*$/];
};


exports.JavaScriptLintRules = JavaScriptLintRules;
