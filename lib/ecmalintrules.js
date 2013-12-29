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
 * @inherits {LintRulesBase}
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
    this._indentation = indentation.IndentationRules();
};


/**
 * Handle errors associated with a parameter missing a @param tag.
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
        var parts = line.split(/\s/);

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
                    _s.sprintf('Line too long (%d ccharacters).', line.length),
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
        if (pieces.length == 1 && _s.count(flagType, '|') &&
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
        this._errorHandler(errors.Errors.LINE_STARTS_WITH_OPERATOR,
                _s.sprintf('Binary operator should go on previous line "%s".',
                        token.string), token);
    }
};


/**
 * Returns whether a space should appear before the given operator token.
 *
 * @param {Token} token The operator token.
 * @returns {boolean} Whether there should be a space before the token.
 * @private
 */
EcmaScriptLintRules.prototype._expectSpaceBeforeOperator = function(token) {
    if (token.string == '.' || token.metadata.isUnaryOperator()) {
        return false;
    }

    // Colons should appear in labels, object literals, the case of a switch
    // statement, and ternary operator. Only want a space in the case of the
    // ternary operator.
    if (token.string == ':' && _.contains([Context.LITERAL_ELEMENT,
                Context.CASE_BLOCK, Context.STATEMENT],
            token.metadata.context.type)) {
        return false;
    }

    if (token.metadata.isUnaryOperator() && token.isFirstInLine()) {
        return false;
    }

    return true;
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
            var spaceCount = token.string.length - token.string.trim().length;
            if (spaceCount) {
                this._handleError(errors.Errors.EXTRA_SPACE,
                        'Extra space after "("', token,
                        new Position(0, spaceCount));
            }
        }

    } else if (tokenType == Type.START_BLOCK &&
            token.metadata.context.type == Context.Type.BLOCK) {
        this._checkForMissingSpaceBeforeToken(token);

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
 * @returns {Array.<RegExp>} A list of regexps, used as matches (rather than
 *      searches).
 */
EcmaScriptLintRules.prototype.getLongLineExceptions = function() {
    return [];
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
