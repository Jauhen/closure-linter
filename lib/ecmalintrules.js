var program = require('commander');
var _ = require('underscore');
var _s = require('underscore.string');
var checkerBase = require('./checkerbase');
var ecmaMetadataPass = require('./ecmametadatapass');
var errors = require('./errors');
var errorCheck = require('./errorcheck');
var errorRules = require('./errorrules');
var indentation = require('./indentation');
var stateTracker = require('./statetracker');
var javascriptTokens = require('./javascripttokens');
var position = require('../common/position');
var tokenUtil = require('./tokenutil');

var Context = ecmaMetadataPass.EcmaContext;
var Position = position.Position;
var Rule = errorCheck.Rule;
var Type = javascriptTokens.JavaScriptTokenType;


/**
 * EcmaScript lint style checking rules.
 *
 * Can be used to find common style errors in JavaScript, ActionScript and other
 * Ecma like scripting languages.  Style checkers for Ecma scripting languages
 * should inherit from this style checker.
 * Please do not add any state to EcmaScriptLintRules or to any subclasses.
 *
 * All state should be added to the StateTracker subclass used for a particular
 * language.
 * @constructor
 * @extends {LintRulesBase}
 */
var EcmaScriptLintRules = function() {
    checkerBase.LintRulesBase.call(this);
    if (EcmaScriptLintRules.maxLineLength == -1) {
        EcmaScriptLintRules.maxLineLength = errorRules.getMaxLineLength();
    }
};

_.extend(EcmaScriptLintRules.prototype, checkerBase.LintRulesBase.prototype);


/**
 * Initialize this lint rule object before parsing a new file.
 */
EcmaScriptLintRules.prototype.initialize = function(checker, limitedDocChecks,
                                                    isHtml) {
    checkerBase.LintRulesBase.prototype.initialize.call(this, checker,
            limitedDocChecks, isHtml);
    this._indentation = new indentation.IndentationRules();
};


/**
 * Handle errors associated with a parameter missing a '@param' tag.
 */
EcmaScriptLintRules.prototype.handleMissingParameterDoc = function(token,
                                                                   paramName) {
    throw new TypeError(
            'Abstract method HandleMissingParameterDoc not implemented.');
};


/**
 * Checks whether the line is too long.
 * @param {Token} lastToken The last token in the line.
 * @param {StateTracker} state Object that indicates the current state in
 *      the page.
 * @private
 */
EcmaScriptLintRules.prototype._checkLineLength = function(lastToken, state) {
    // Start from the last token so that we have the flag object attached to
    // and DOC_FLAG tokens.
    var lineNumber = lastToken.lineNumber;
    var token = lastToken;

    // Build a representation of the string where spaces indicate potential
    // line-break locations.
    var line = '';
    while (token && token.lineNumber == lineNumber) {
        if (state.isTypeToken(token)) {
            line = token.string.replace(/./g, 'x') + line;
        } else if (_.contains([Type.IDENTIFIER, Type.NORMAL], token.type)) {
            // Dots are acceptable places to wrap.
            line = token.string.replace('.', ' ') + line;
        } else {
            line = token.string + line;
        }

        token = token.previous;
    }
    line = _s.rstrip(line, '\n\r\f');

    var length = line.length;

    if (length > EcmaScriptLintRules.maxLineLength) {
        // If the line matches one of the exceptions, then it's ok.
        if (_.find(this.getLongLineExceptions(), function(regexp) {
            return regexp.test(lastToken.line);
        })) {
            return;
        }

        // If the line consists of only one "word", or multiple words but all
        // except one are ignoreable, then it's ok.
        var parts = _.filter(line.trim().split(/\s/), _.identity);

        // We allow two "words" (type and name) when the line contains @param
        var maxParts = 1;
        if (_.contains(parts, '@param')) {
            maxParts = 2;
        }

        // Custom tags like @requires may have url like descriptions, so ignore
        // the tag, similar to how we handle @see.
        var customTags = _.map(program.custom_jsdoc_tags, function(tag) {
            return '@' + tag;
        });
        if (_.difference(parts, _.union(EcmaScriptLintRules.LONG_LINE_IGNORE,
                customTags)).length > maxParts) {
            this._handleError(errors.Errors.LINE_TOO_LONG,
                    _s.sprintf('Line too long (%d characters).', line.length),
                    lastToken);
        }
    }

};


/**
 * Checks the given type for style errors.
 * @param {Token} token The DOC_FLAG token for the flag whose type to check.
 * @private
 */
EcmaScriptLintRules.prototype._checkJsDocType = function(token) {
    var flag = token.attachedObject;
    var flagType = flag.type;
    if (flagType && flagType.trim()) {
        var pieces = flagType.split(EcmaScriptLintRules.TYPE_SPLIT);
        if (pieces.length == 1 && _s.count(flagType, '|') == 1 &&
                (_s.endsWith(flagType, '|null') ||
                        _s.startsWith(flagType, 'null|'))) {
            this._handleError(errors.Errors.JSDOC_PREFER_QUESTION_TO_PIPE_NULL,
                    _s.sprintf('Prefer "?Type" to "Type|null": "%s"', flagType),
                    token);
        }

        // TODO(user): We should do actual parsing of JsDoc types to report an
        // error for wrong usage of '?' and '|' e.g. {?number|string|null} etc.
        if (errorCheck.shouldCheck(Rule.BRACES_AROUND_TYPE) &&
                (flag.typeStartToken.type != Type.DOC_START_BRACE ||
                        flag.typeEndToken.type != Type.DOC_END_BRACE)) {
            this._handleError(errors.Errors.MISSING_BRACES_AROUND_TYPE,
                    'Type must always be surrounded by curly braces.', token);
        }
    }
};


/**
 * Checks for a missing space at the beginning of a token.
 *
 * Reports a MISSING_SPACE error if the token does not begin with a space or
 * the previous token doesn't end with a space and the previous token is on the
 * same line as the token.
 * @param {Token} token The token being checked.
 * @private
 */
EcmaScriptLintRules.prototype._checkForMissingSpaceBeforeToken = function(
        token) {
    // TODO(user): Check if too many spaces?
    if (token.string.length == _s.lstrip(token.string).length &&
            token.previous && token.lineNumber == token.previous.lineNumber &&
            token.previous.string.length ==
                    _s.rstrip(token.previous.string).length) {
        this._handleError(errors.Errors.MISSING_SPACE,
                _s.sprintf('Missing space before "%s".', token.string),
                token, Position.atBeginning());
    }
};


/**
 * Checks an operator for spacing and line style.
 * @param {Token} token The operator token.
 * @private
 */
EcmaScriptLintRules.prototype._checkOperator = function(token) {
    var lastCode = token.metadata.lastCode;

    if (!this._expectSpaceBeforeOperator(token)) {
        if (token.previous && token.previous.type == Type.WHITESPACE &&
                lastCode &&
                _.contains([Type.NORMAL, Type.IDENTIFIER], lastCode.type)) {
            this._handleError(errors.Errors.EXTRA_SPACE,
                    _s.sprintf('Extra space before "%s".', token.string),
                    token.previous, Position.all(token.previous.string));
        }
    } else if (token.previous && !token.previous.isComment() &&
            _.contains(Type.EXPRESSION_ENDER_TYPES, token.previous.type)) {
        this._handleError(errors.Errors.MISSING_SPACE,
                _s.sprintf('Missing space before "%s".', token.string),
                token, Position.atBeginning());
    }

    // Check that binary operators are not used to start lines.
    if ((!lastCode || lastCode.lineNumber != token.lineNumber) &&
            !token.metadata.isUnaryOperator()) {
        this._handleError(errors.Errors.LINE_STARTS_WITH_OPERATOR,
                _s.sprintf('Binary operator should go on previous line "%s".',
                        token.string), token);
    }
};


/**
 * Returns whether a space should appear before the given operator token.
 *
 * @param {Token} token The operator token.
 * @return {boolean} Whether there should be a space before the token.
 * @private
 */
EcmaScriptLintRules.prototype._expectSpaceBeforeOperator = function(token) {
    if (token.string == ',' || token.metadata.isUnaryOperator()) {
        return false;
    }

    // Colons should appear in labels, object literals, the case of a switch
    // statement, and ternary operator. Only want a space in the case of the
    // ternary operator.
    if (token.string == ':' && _.contains([Context.Type.LITERAL_ELEMENT,
                Context.Type.CASE_BLOCK, Context.Type.STATEMENT],
            token.metadata.context.type)) {
        return false;
    }

    return !(token.metadata.isUnaryOperator() && token.isFirstInLine());
};


/**
 * Checks a token, given the current parser_state, for warnings and errors.
 *
 * @param {Token} token The current token under consideration.
 * @param {StateTracker} state Object that indicates the current state in
 *      the page.
 */
EcmaScriptLintRules.prototype.checkToken = function(token, state) {
    // Store some convenience variables.
    var firstInLine = token.isFirstInLine();
    var lastInLine = token.isLastInLine();
    var lastNonSpaceToken = state.getLastNonSpaceToken();

    var tokenType = token.type;

    // Process the line change.
    if (!this._isHtml && errorCheck.shouldCheck(Rule.INDENTATION)) {
        // TODO(robbyw): Support checking indentation in HTML files.
        var indentationErrors = this._indentation.checkToken(token, state);
        _.each(indentationErrors, function(ie) {
            this._handleError(ie.code, ie.message, ie.token, ie.position,
                    ie.fixData);
        }, this);
    }

    if (lastInLine) {
        this._checkLineLength(token, state);
    }

    if (tokenType == Type.PARAMETERS) {
        // Find missing spaces in parameter lists.
        if (EcmaScriptLintRules.MISSING_PARAMETER_SPACE.test(token.string)) {
            var fixData = _.map(token.string.split(','), function(s) {
                return s.trim();
            }).join(', ');
            this._handleError(errors.Errors.MISSING_SPACE,
                    'Missing space after ",".', token, null, fixData);
        }

        // Find extra spaces at the beginning of parameter lists.  Make sure
        // we aren't at the beginning of a continuing multi-line list.
        if (!firstInLine) {
            var spaceCount = token.string.length -
                    _s.lstrip(token.string).length;
            if (spaceCount) {
                this._handleError(errors.Errors.EXTRA_SPACE,
                        'Extra space after "("', token,
                        new Position(0, spaceCount));
            }
        }

    } else if (tokenType == Type.START_BLOCK &&
            token.metadata.context.type == Context.Type.BLOCK) {
        this._checkForMissingSpaceBeforeToken(token);

    } else if (tokenType == Type.END_BLOCK) {
        // This check is for object literal end block tokens, but there is no
        // need to test that condition since a comma at the end of any other
        // kind of block is undoubtedly a parse error.
        var lastCode = token.metadata.lastCode;
        if (lastCode.isOperator(',')) {
            this._handleError(errors.Errors.COMMA_AT_END_OF_LITERAL,
                    'Illegal comma at end of object literal', lastCode,
                    Position.all(lastCode.string));
        }

        if (state.inFunction() && state.isFunctionClose()) {
            var isImmediatelyCalled = !!token.next &&
                    token.next.type == Type.START_PAREN;
            if (state.inTopLevelFunction()) {
                // A semicolons should not be included at the end of a function
                // declaration.
                if (!state.inAssignedFunction()) {
                    if (!lastInLine && token.next.type == Type.SEMICOLON) {
                        this._handleError(
                                errors.Errors.ILLEGAL_SEMICOLON_AFTER_FUNCTION,
                                'Illegal semicolon after function declaration',
                                token.next, Position.all(token.next.string));
                    }
                }
            }

            // A semicolon should be included at the end of a function
            // expression that is not immediately called.
            if (state.inAssignedFunction()) {
                if (!isImmediatelyCalled &&
                        (lastInLine || token.next.type != Type.SEMICOLON)) {
                    this._handleError(
                            errors.Errors.MISSING_SEMICOLON_AFTER_FUNCTION,
                            'Missing semicolon after function assigned to a ' +
                            'variable', token, Position.atEnd(token.string));
                }
            }

            if (state.inInterfaceMethod() &&
                    lastCode.type != Type.START_BLOCK) {
                this._handleError(
                        errors.Errors.INTERFACE_METHOD_CANNOT_HAVE_CODE,
                        'Interface methods cannot contain code', lastCode);
            }
        } else if (state.isBlockClose() && token.next &&
                token.next.type == Type.SEMICOLON) {
            if (lastCode.metadata.context.parent.type !=
                    Context.Type.OBJECT_LITERAL &&
                    lastCode.metadata.context.type !=
                            Context.Type.OBJECT_LITERAL) {
                this._handleError(errors.Errors.REDUNDANT_SEMICOLON,
                        'No semicolon is required to end a code block',
                        token.next, Position.all(token.next.string));
            }
        }

    } else if (tokenType == Type.SEMICOLON) {
        if (token.previous && token.previous.type == Type.WHITESPACE) {
            this._handleError(errors.Errors.EXTRA_SPACE,
                    'Extra space before ";"', token.previous,
                    Position.all(token.previous.string));
        }

        if (token.next && token.next.lineNumber == token.lineNumber) {
            if (token.metadata.context.type != Context.Type.FOR_GROUP_BLOCK) {
                // TODO(robbyw): Error about no multi-statement lines.
            } else if (!_.contains([Type.WHITESPACE, Type.SEMICOLON,
                Type.END_PAREN], token.next.type)) {
                this._handleError(errors.Errors.MISSING_SPACE,
                        'Missing space after ";" in for statement',
                        token.next, Position.atBeginning());
            }
        }

        lastCode = token.metadata.lastCode;
        if (lastCode && lastCode.type == Type.SEMICOLON) {
            // Allow a single double semi colon in for loops for cases like:
            // for (;;) { }.
            // NOTE(user): This is not a perfect check, and will not throw an
            // error for cases like: for (var i = 0;; i < n; i++) {}, but then
            // your code probably won't work either.
            var forToken = tokenUtil.customSearch(lastCode,
                    function(token) {
                        return token.type == Type.KEYWORD &&
                                token.string == 'for';
                    },
                    function(token) {return token.type == Type.SEMICOLON},
                    null, true);

            if (!forToken) {
                this._handleError(errors.Errors.REDUNDANT_SEMICOLON,
                        'Redundant semicolon', token,
                        Position.all(token.string));
            }
        }

    } else if (tokenType == Type.START_PAREN) {
        if (token.previous && token.previous.type == Type.KEYWORD) {
            this._handleError(errors.Errors.MISSING_SPACE,
                    'Missing space before "("', token, Position.atBeginning());
        } else if (token.previous && token.previous.type == Type.WHITESPACE) {
            var beforeSpace = token.previous.previous;
            if (beforeSpace && beforeSpace.lineNumber == token.lineNumber &&
                    beforeSpace.type == Type.IDENTIFIER) {
                this._handleError(errors.Errors.EXTRA_SPACE,
                        'Extra space before "("', token,
                        Position.all(token.previous.string));
            }
        }

    } else if (tokenType == Type.START_BRACKET) {
        this._handleStartBracket(token, lastNonSpaceToken);

    } else if (tokenType == Type.END_PAREN || tokenType == Type.END_BRACKET) {
        // Ensure there is no space before closing parentheses, except when
        // it's in a for statement with an omitted section, or when it's at the
        // beginning of a line.
        if (token.previous && token.previous.type == Type.WHITESPACE &&
                !token.previous.isFirstInLine() && !(lastNonSpaceToken &&
                lastNonSpaceToken.lineNumber == token.lineNumber &&
                lastNonSpaceToken.type == Type.SEMICOLON)) {
            this._handleError(errors.Errors.EXTRA_SPACE,
                    _s.sprintf('Extra space before "%s"', token.string),
                    token.previous, Position.all(token.previous.string));
        }

        if (token.type == Type.END_BRACKET) {
            lastCode = token.metadata.lastCode;
            if (lastCode.isOperator(',')) {
                this._handleError(errors.Errors.COMMA_AT_END_OF_LITERAL,
                        'Illegal comma at end of array literal', lastCode,
                        Position.all(lastCode.string));
            }
        }

    } else if (tokenType == Type.WHITESPACE) {
        if (EcmaScriptLintRules.ILLEGAL_TAB.test(token.string)) {
            if (token.isFirstInLine()) {
                if (token.next && token.next.lineNumber == token.lineNumber) {
                    this._handleError(errors.Errors.ILLEGAL_TAB,
                            _s.sprintf('Illegal tab in whitespace before "%s"',
                                    token.next.string),
                    token, Position.all(token.string));
                } else {
                    this._handleError(errors.Errors.ILLEGAL_TAB,
                            'Illegal tab in whitespace',
                            token, Position.all(token.string));
                }
            } else {
                this._handleError(errors.Errors.ILLEGAL_TAB,
                        _s.sprintf('Illegal tab in whitespace after "%s"',
                                token.previous.string),
                        token, Position.all(token.string));
            }
        }
        // Check whitespace length if it's not the first token of the line and
        // if it's not immediately before a comment.
        if (lastInLine) {
            // Check for extra whitespace at the end of a line.
            this._handleError(errors.Errors.EXTRA_SPACE,
                    'Extra space at end of line', token,
                    Position.all(token.string));
        } else if (!firstInLine && !token.next.isComment()) {
            if (token.length > 1) {
                this._handleError(errors.Errors.EXTRA_SPACE,
                        _s.sprintf('Extra space after "%s"',
                                token.previous.string),
                        token, new Position(1, token.string.length - 1));
            }
        }

    } else if (tokenType == Type.OPERATOR) {
        this._checkOperator(token);

    } else if (tokenType == Type.DOC_FLAG) {
        var flag = token.attachedObject;

        if (flag.flagType == 'bug') {
            // TODO(robbyw): Check for exactly 1 space on the left.
            var string = _s.ltrim(token.next.string);
            string = string.split(' ', 1)[0];

            if (isNaN(string)) {
                this._handleError(errors.Errors.NO_BUG_NUMBER_AFTER_BUG_TAG,
                        '@bug should be followed by a bug number', token);
            }
        } else if (flag.flagType == 'suppress') {
            if (flag.type == null) {
                // A syntactically invalid suppress tag will get tokenized as
                // a normal flag, indicating an error.
                this._handleError(errors.Errors.INCORRECT_SUPPRESS_SYNTAX,
                        'Invalid suppress syntax: should be @suppress ' +
                                '{errortype}. Spaces matter.', token);
            } else {
                _.each(flag.type.split(/\||,/), function(suppressType) {
                    if (!_.contains(state.getDocFlag().SUPPRES_TYPES,
                            suppressType)) {
                        this._handleError(errors.Errors.INVALID_SUPPRESS_TYPE,
                                _s.sprintf('Invalid suppression type: %s',
                                        suppressType),
                                token);
                    }
                }, this);
            }
        } else if (errorCheck.shouldCheck(Rule.WELL_FORMED_AUTHOR) &&
                flag.flagType == 'author') {
            // TODO(user): In non strict mode check the author tag for as much
            // as it exists, though the full form checked below isn't required.
            string = token.next.string;
            var result = EcmaScriptLintRules.AUTHOR_SPEC.exec(string);
            if (!result) {
                this._handleError(errors.Errors.INVALID_AUTHOR_TAG_DESCRIPTION,
                        'Author tag line should be of the form: ' +
                        '@author foo@somewhere.com (Your Name)', token.next);
            } else {
                // Check spacing between email address and name. Do this before
                // checking earlier spacing so positions are easier to
                // calculate for autofixing.
                var numSpaces = result[2].length;
                if (numSpaces < 1) {
                    this._handleError(errors.Errors.MISSING_SPACE,
                            'Missing space after email address',
                            token.next, Position(string.indexOf('('), 0));
                } else if (numSpaces > 1) {
                    this._handleError(errors.Errors.EXTRA_SPACE,
                            'Extra space after email address', token.next,
                            new Position(string.indexOf('(') - numSpaces + 1,
                                    numSpaces - 1));
                }

                // Check for extra spaces before email address. Can't be too
                // few, if not at least one we wouldn't match @author tag.
                numSpaces = result[1].length;
                if (numSpaces > 1) {
                    this._handleError(errors.Errors.EXTRA_SPACE,
                            'Extra space before email address',
                            token.next, new Position(1, numSpaces - 1));
                }
            }
        } else if (_.contains(state.getDocFlag().HAS_DESCRIPTION,
                flag.flagType) && !this._limitedDocChecks) {
            if (flag.flagType == 'param') {
                if (flag.name == null) {
                    this._handleError(errors.Errors.MISSING_JSDOC_PARAM_NAME,
                            'Missing name in @param tag', token);
                }
            }

            if (!flag.description) {
                // TagName should be [3] for DOC_FLAG. We use indexes because
                // JS RegExp doesn't support named groups.
                var flagName = '@' + token.values[3];

                if (!_.contains(EcmaScriptLintRules.
                            JSDOC_FLAGS_DESCRIPTION_NOT_REQUIRED, flagName)) {
                    this._handleError(
                            errors.Errors.MISSING_JSDOC_TAG_DESCRIPTION,
                            _s.sprintf('Missing description in %s tag',
                                    flagName), token);
                }
            } else {
                this._checkForMissingSpaceBeforeToken(
                        flag.descriptionStartToken);
            }
        }

        if (_.contains(state.getDocFlag().HAS_TYPE, flag.flagType)) {
            if (flag.typeStartToken != null) {
                this._checkForMissingSpaceBeforeToken(
                        token.attachedObject.typeStartToken);
            }

            if (flag.type && flag.type.trim()) {
                this._checkJsDocType(token);
            }
        }
    }

    if (tokenType == Type.DOC_FLAG || tokenType == Type.DOC_INLINE_FLAG) {
        // TagName should be [1] for DOC_INLINE_FLAG and [2] for DOC_FLAG.
        var tagName = _.last(token.values);
        if (!_.contains(_.union(program.custom_jsdoc_tags || [],
                state.getDocFlag().LEGAL_DOC), tagName)) {
            this._handleError(errors.Errors.INVALID_JSDOC_TAG,
                    _s.sprintf('Invalid JsDoc tag: %s', tagName),
                    token);
        }

        if (errorCheck.shouldCheck(Rule.NO_BRACES_AROUND_INHERIT_DOC) &&
                tagName == 'inheritDoc' &&
                tokenType == Type.DOC_INLINE_FLAG) {
            this._handleError(
                    errors.Errors.UNNECESSARY_BRACES_AROUND_INHERIT_DOC,
                    'Unnecessary braces around @inheritDoc', token);
        }
    } else if (tokenType == Type.SIMPLE_LVALUE) {
        // Identifier should have index [1];
        var identifier = token.values[1];

        if ((!state.inFunction() || state.inConstructor()) &&
                state.inTopLevel() && !state.inObjectLiteralDescendant()) {
            var jsdoc = state.getDocComment();
            if (!state.hasDocComment(identifier)) {
                // Only test for documentation on identifiers with .s in them to
                // avoid checking things like simple variables. We don't require
                // documenting assignments to .prototype itself (bug 1880803).
                if (!state.inConstructor() && identifier.indexOf('.') != -1 &&
                        !_s.endsWith(identifier, '.prototype') &&
                        !this._limitedDocChecks) {
                    var comment = state.getLastComment();
                    if (!(comment && comment.toLowerCase().indexOf(
                            'jsdoc inherited') != -1)) {
                        this._handleError(
                                errors.Errors.MISSING_MEMBER_DOCUMENTATION,
                                _s.sprintf('No docs found for member "%s"',
                                        identifier), token);
                    }
                }
            } else if (jsdoc && (!state.inConstructor() ||
                    _s.startsWith(identifier, 'this.'))) {
                // We are at the top level and the function/member is
                // documented.
                if (_s.endsWith(identifier, '_') &&
                        !_s.endsWith(identifier, '__')) {

                    var accessControlSuppressed = _.contains(
                            _.keys(jsdoc.suppressions), 'accessControls');
                    var underscoreSuppressed = _.contains(
                            _.keys(jsdoc.suppressions), 'underscore');
                    // Can have a private class which inherits documentation
                    // from a public superclass.
                    //
                    // @inheritDoc is deprecated in favor of using @override,
                    // and they
                    if (jsdoc.hasFlag('override') &&
                            !jsdoc.hasFlag('constructor') &&
                            !accessControlSuppressed) {
                        this._handleError(
                                errors.Errors.INVALID_OVERRIDE_PRIVATE,
                                _s.sprintf('%s should not override a private ' +
                                        'member.', identifier),
                                jsdoc.getFlag('override').flagToken);
                    }
                    if (jsdoc.hasFlag('inheritDoc') &&
                            !jsdoc.hasFlag('constructor') &&
                            !accessControlSuppressed) {
                        this._handleError(
                                errors.Errors.INVALID_INHERIT_DOC_PRIVATE,
                                _s.sprintf('%s should not inherit from' +
                                        ' a private member.', identifier),
                                jsdoc.getFlag('inheritDoc').flagToken);
                    }
                    if (!jsdoc.hasFlag('private') &&
                            !underscoreSuppressed &&
                            !((jsdoc.hasFlag('inheritDoc') ||
                                    jsdoc.hasFlag('override')) &&
                                    accessControlSuppressed)) {
                        this._handleError(errors.Errors.MISSING_PRIVATE,
                                _s.sprintf(
                                        'Member "%s" must have @private JsDoc.',
                                        identifier), token);
                    }
                    if (jsdoc.hasFlag('private') && underscoreSuppressed) {
                        this._handleError(errors.Errors.UNNECESSARY_SUPPRESS,
                                '@suppress {underscore} is not necessary ' +
                                        'with @private',
                                jsdoc.suppressions['underscore']);
                    }
                } else if (jsdoc.hasFlag('private') &&
                        !this.inExplicitlyTypedLanguage()) {
                    // It is convention to hide public fields in some ECMA
                    // implementations from documentation using the
                    // @private tag.
                    this._handleError(errors.Errors.EXTRA_PRIVATE,
                            _s.sprintf(
                                    'Member "%s" must not have @private JsDoc',
                                    identifier), token);
                }

                _.each(['desc', 'hidden', 'meaning'], function(f) {
                    if (jsdoc.hasFlag(f) &&
                            !_s.startsWith(identifier, 'MSG_') &&
                            identifier.indexOf('.MSG_') == -1) {
                        this._handleError(errors.Errors.INVALID_USE_OF_DESC_TAG,
                                _s.sprintf(
                                        'Member "%s" should not have @%s JsDoc',
                                        identifier, f), token);
                    }
                }, this);
            }
        }

        // Check for illegaly assigning live objects as prototype property
        // values.
        var index = identifier.indexOf('.prototype.');
        // Ignore anything with additional .s after the prototype.
        if (index != -1 && identifier.indexOf('.', index + 11) == -1) {
            var equalOperator = tokenUtil.searchExcept(token,
                    Type.NON_CODE_TYPES);
            var nextCode = tokenUtil.searchExcept(equalOperator,
                    Type.NON_CODE_TYPES);
            if (nextCode && (_.contains([Type.START_BRACKET, Type.START_BLOCK],
                    nextCode.type) || nextCode.isOperator('new'))) {
                this._handleError(errors.Errors.ILLEGAL_PROTOTYPE_MEMBER_VALUE,
                        _s.sprintf(
                                'Member %s cannot have a non-primitive value',
                                identifier),
                        token);
            }
        }
    } else if (tokenType == Type.END_PARAMETERS) {
        // Find extra space at the end of parameter lists.  We check the token
        // prior to the current one when it is a closing paren.
        if (token.previous && token.previous.type == Type.PARAMETERS &&
                EcmaScriptLintRules.ENDS_WITH_SPACE.test(
                        token.previous.string)) {
            this._handleError(errors.Errors.EXTRA_SPACE,
                    'Extra space before ")"', token.previous);
        }

        jsdoc = state.getDocComment();
        if (state.getFunction().isInterface) {
            if (token.previous && token.previous.type == Type.PARAMETERS) {
                this._handleError(
                        errors.Errors.INTERFACE_CONSTRUCTOR_CANNOT_HAVE_PARAMS,
                        'Interface constructor cannot have parameters.',
                        token.previous);
            }
        } else if (state.inTopLevel() && jsdoc && !jsdoc.hasFlag('see') &&
                !jsdoc.inheritsDocumentation() &&
                !state.inObjectLiteralDescendant() && !jsdoc.isInvalidated()) {
            var params = jsdoc.compareParameters(state.getParams());
            if (params.distance) {
                var stateParams = state.getParams();
                var paramIndex = 0;
                var orderedParams = jsdoc.orderedParams();
                var docsIndex = 0;
                _.each(params.edit, function(op) {
                    if (op == 'I') {
                        // Insertion.
                        // Parsing doc comments is the same for all languages
                        // but some languages care about parameters that don't
                        // have doc comments and some languages don't care.
                        // Languages that don't allow variables to by typed
                        // such as JavaScript care but languages such as
                        // ActionScript or Java that allow variables to be
                        // typed don't care.
                        if (!this._limitedDocChecks) {
                            this.handleMissingParameterDoc(token,
                                    stateParams[paramIndex++]);
                        }

                    } else if (op == 'D') {
                        // Deletion.
                        this._handleError(
                                errors.Errors.EXTRA_PARAMETER_DOCUMENTATION,
                                _s.sprintf('Found docs for non-existing ' +
                                        'parameter: "%s"',
                                        orderedParams[docsIndex++]),
                                token);

                    } else if (op == 'S') {
                        // Substitution.
                        if (!this._limitedDocChecks) {
                            this._handleError(
                                    errors.Errors.WRONG_PARAMETER_DOCUMENTATION,
                                    _s.sprintf('Parameter mismatch: got ' +
                                            '"%s", expected "%s"',
                                            stateParams[paramIndex++],
                                            orderedParams[docsIndex++]),
                                    token);
                        }

                    } else {
                        // Equality - just advance the iterators.
                        paramIndex++;
                        docsIndex++;
                    }
                }, this);
            }
        }
    } else if (tokenType == Type.STRING_TEXT) {
        // If this is the first token after the start of the string, but it's
        // at the end of a line, we know we have a multi-line string.
        if (_.contains([Type.SINGLE_QUOTE_STRING_START,
                Type.DOUBLE_QUOTE_STRING_START], token.previous.type) &&
                lastInLine) {
            this._handleError(errors.Errors.MULTI_LINE_STRING,
                    'Multi-line strings are not allowed', token);
        }
    }

    // This check is orthogonal to the ones above, and repeats some types,
    // so it is a plain if and not an else if.
    if (_.contains(Type.COMMENT_TYPES, token.type)) {
        if (EcmaScriptLintRules.ILLEGAL_TAB.test(token.string)) {
            this._handleError(errors.Errors.ILLEGAL_TAB,
                    _s.sprintf('Illegal tab in comment "%s"', token.string),
                    token);
        }

        var trimmed = _s.rstrip(token.string);
        if (lastInLine && token.string != trimmed) {
            // Check for extra whitespace at the end of a line.
            this._handleError(errors.Errors.EXTRA_SPACE,
                    'Extra space at end of line', token,
                    new Position(trimmed.length,
                            token.string.length - trimmed.length));
        }
    }

    // This check is also orthogonal since it is based on metadata.
    if (token.metadata.isImpliedSemicolon) {
        this._handleError(errors.Errors.MISSING_SEMICOLON,
                'Missing semicolon at end of line', token);
    }
};


/**
 * Handles a token that is an open bracket.
 * @param {Token} token The token to handle.
 * @param {Token} lastNonSpaceToken The last token that was not a space.
 * @private
 */
EcmaScriptLintRules.prototype._handleStartBracket = function(token,
        lastNonSpaceToken) {
    if (!token.isFirstInLine() && token.previous.type == Type.WHITESPACE &&
            lastNonSpaceToken &&
            _.contains(Type.EXPRESSION_ENDER_TYPES, lastNonSpaceToken.type)) {
        this._handleError(errors.Errors.EXTRA_SPACE, 'Extra space before "["',
                token.previous, Position.all(token.previous.string));

    // If the [ token is the first token in a line we shouldn't complain
    // about a missing space before [.  This is because some Ecma script
    // languages allow syntax like:
    // [Annotation]
    // class MyClass {...}
    // So we don't want to blindly warn about missing spaces before [.
    // In the the future, when rules for computing exactly how many spaces
    // lines should be indented are added, then we can return errors for
    // [ tokens that are improperly indented.
    // For example:
    // var someVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryVeryLongVariableName =
    // [a,b,c];
    // should trigger a proper indentation warning message as [ is not indented
    // by four spaces.
    } else if (!token.isFirstInLine() && token.previous && !_.contains(
            _.union([Type.WHITESPACE, Type.START_PAREN, Type.START_BRACKET],
                Type.EXPRESSION_ENDER_TYPES),
            token.previous.type)) {
        this._handleError(errors.Errors.MISSING_SPACE,
                'Missing space before "["', token, Position.atBeginning());
    }
};


/**
 * Perform all checks that need to occur after all lines are processed.
 * @param {StateTracker} state State of the parser after parsing all tokens.
 */
EcmaScriptLintRules.prototype.finalize = function(state) {
    var lastNonSpaceToken = state.getLastNonSpaceToken();
    // Check last line for ending with newline.
    var lastLine = state.getLastLine();
    if (lastLine &&
            !(!lastLine.trim() || _s.rstrip(lastLine, '\n\r\f') != lastLine)) {
        this._handleError(errors.Errors.FILE_MISSING_NEWLINE,
                _s.sprintf('File does not end with new line.  (%s)', lastLine),
                lastNonSpaceToken);
    }

    try {
        //this._indentation.finalize();
    } catch (e) {
        this._handleError(errors.Errors.FILE_DOES_NOT_PARSE,
                e.message, lastNonSpaceToken);
    }
};


/**
 * Gets a list of regexps for lines which can be longer than the limit.
 * @return {Array.<RegExp>} A list of regexps, used as matches (rather than
 *      searches).
 */
EcmaScriptLintRules.prototype.getLongLineExceptions = function() {
    return [];
};


/**
 * Returns whether this ecma implementation is explicitly typed.
 */
EcmaScriptLintRules.prototype.inExplicitlyTypedLanguage = function() {
    return false;
};


EcmaScriptLintRules.maxLineLength = -1;

EcmaScriptLintRules.MISSING_PARAMETER_SPACE = /,\S/;

EcmaScriptLintRules.EXTRA_SPACE = /(\(\s|\s\))/;

EcmaScriptLintRules.ENDS_WITH_SPACE = /\s$/;

EcmaScriptLintRules.ILLEGAL_TAB = /\t/;

// Regex used to split up complex types to check for invalid use of ? and |.
EcmaScriptLintRules.TYPE_SPLIT = /[,<>()]/;

// Regex for form of author lines after the @author tag.
EcmaScriptLintRules.AUTHOR_SPEC = /(\s*)[^\s]+@[^(\s]+(\s*)\(.+\)/;

// Acceptable tokens to remove for line too long testing.
EcmaScriptLintRules.LONG_LINE_IGNORE = _.union(['*', '//', '@see'],
        _.map(stateTracker.DocFlag.HAS_TYPE, function(tag) {
            return '@' + tag;
        }));

EcmaScriptLintRules.JSDOC_FLAGS_DESCRIPTION_NOT_REQUIRED =
        ['@param', '@return', '@returns'];


exports.EcmaScriptLintRules = EcmaScriptLintRules;
