var _ = require('underscore');
var _s = require('underscore.string');

var javascriptTokens = require('./javascripttokens');

var Type = javascriptTokens.JavaScriptTokenType;

/**
 * Compares two tokens and determines their relative order.
 *
 * @param {Token} token1 The first token to compare.
 * @param {Token} token2 The second token to compare.
 * @return {number} A negative integer, zero, or a positive integer as the first
 * token is before, equal, or after the second in the token stream.
 */
var compare = function(token1, token2) {
    if (token2.lineNumber != token1.lineNumber) {
        return token1.lineNumber - token2.lineNumber;
    }

    return token1.startIndex - token2.startIndex;
};


/**
 * Returns the first token where func is True within distance of this token.
 *
 * @param {Token} startToken The token to start searching from.
 * @param {function(Token):boolean} func The function to call to test a token
 *      for applicability.
 * @param {?function(Token):boolean} opt_endFunc The function to call to test
 *      a token to determine whether to abort the search.
 * @param {?number} opt_distance The number of tokens to look through before
 *      failing search.  Must be positive.  If unspecified, will search until
 *      the end of the token chain.
 * @param {?boolean} opt_reverse When true, search the tokens before this one
 *      instead of the tokens after it.
 * @return {?Token} When true, search the tokens before this one instead of
 *      the tokens after it.
 */
var customSearch = function(startToken, func, opt_endFunc, opt_distance,
                            opt_reverse) {
    var token = startToken;
    while (token && (opt_distance == null || opt_distance > 0)) {
        var next = opt_reverse ? token.previous : token.next;
        if (next) {
            if (func(next)) {
                return next;
            }
            if (opt_endFunc && opt_endFunc(next)) {
                return null;
            }
        }

        token = next;
        if (opt_distance != null) {
            opt_distance--;
        }
    }

    return null;
};


/**
 * Returns the first token not of any type in token_types within distance.
 *
 * @param {Token} startToken The token to start searching from.
 * @param {Array.<TokenType>} tokenTypes The unallowable types of the token
 *      being searched for.
 * @param {?number} opt_distance The number of tokens to look through before
 *      failing search.  Must be positive.  If unspecified, will search until
 *      the end of the token chain.
 * @param {?boolean} opt_reverse When true, search the tokens before this one
 *      instead of the tokens after it.
 * @return {?Token} The first token of any type in token_types within distance
 *      of this token, or null if no such token is found.
 */
var searchExcept = function(startToken, tokenTypes, opt_distance, opt_reverse) {
    return customSearch(startToken,
            function(token) {return !token.isAnyType(tokenTypes)},
            null, opt_distance || null, opt_reverse || false);
};


/**
 * Returns the first token of type in token_types before a token of end_type.
 *
 * @param {Token} startToken The token to start searching from.
 * @param {Array.<TokenType>} tokenTypes The unallowable types of the token
 *      being searched for.
 * @param {Array.<TokenType>} endTypes Types of tokens to abort search if we
 *      find.
 * @param {?number} opt_distance The number of tokens to look through before
 *      failing search.  Must be positive.  If unspecified, will search until
 *      the end of the token chain.
 * @param {?boolean} opt_reverse When true, search the tokens before this one
 *      instead of the tokens after it.
 * @return {?Token} The first token of any type in token_types within distance
 *      of this token, or null if no such token is found.
 */
var searchUntil = function(startToken, tokenTypes, endTypes, opt_distance,
                           opt_reverse) {
    return customSearch(startToken, function(token) {
        return token.isAnyType(tokenTypes);
    }, function(token) {
        return token.isAnyType(endTypes);
    }, opt_distance || null, opt_reverse || false);
};


/**
 * Returns the first token of type in token_types within distance.
 *
 * @param {Token} startToken The token to start searching from.
 * @param {Array.<TokenType>} tokenTypes The allowable types of the token
 *      being searched for.
 * @param {?number} opt_distance The number of tokens to look through before
 *      failing search.  Must be positive.  If unspecified, will search until
 *      the end of the token chain.
 * @param {?boolean} opt_reverse When true, search the tokens before this one
 *      instead of the tokens after it.
 * @return {?Token} The first token of any type in token_types within distance
 *      of this token, or null if no such token is found.
 */
var search = function(startToken, tokenTypes, opt_distance, opt_reverse) {
    return customSearch(startToken,
            function(token) {return token.isAnyType(tokenTypes)},
            null, opt_distance || null, opt_reverse || false);
};


/**
 * Returns the code token before the specified token.
 * @param {Token} token A token.
 * @return {?Token} The code token before the specified token or null if no
 *      such token exists.
 */
var getPreviousCodeToken = function(token) {
    return customSearch(token, function(token) {
        return token && !_.contains(Type.NON_CODE_TYPES, token.type)}, null,
            null, true);
};


/**
 * Get the symbol specified by a token.
 *
 * Given a token, this function additionally concatenates any parts of an
 * identifying symbol being identified that are split by whitespace or a
 * newline.
 *
 * The function will return None if the token is not the first token of an
 * identifier.
 * @param {Token} token The first token of a symbol.
 * @return {string} The whole symbol, as a string.
 */
var getIdentifierForToken = function(token) {
    // Search backward to determine if this token is the first token of the
    // identifier. If it is not the first token, return None to signal that this
    // token should be ignored.
    var prevToken = token.previous;
    while (prevToken) {
        if (prevToken.isType(Type.IDENTIFIER) ||
                isDot(prevToken)) {
            return null;
        }

        if (prevToken.isType(Type.WHITESPACE) ||
                prevToken.isAnyType(Type.COMMENT_TYPES)) {
            prevToken = prevToken.previous;
        } else {
            break;
        }
    }

    // A "function foo()" declaration.
    if (token.type == Type.FUNCTION_NAME) {
        return token.string;
    }

    // A "var foo" declaration (if the previous token is 'var').
    var previousCodeToken = getPreviousCodeToken(token);

    if (previousCodeToken && previousCodeToken.isKeyword('var')) {
        return token.string;
    }

    // Otherwise, this is potentially a namespaced (goog.foo.bar) identifier
    // that could span multiple lines or be broken up by whitespace.  We need
    // to concatenate.
    var identifierTypes = [Type.IDENTIFIER, Type.SIMPLE_LVALUE];

    // Start with the first token.
    var symbolToken = [token];

    if (token.next) {
        _.find(token.next.directIterator(), function(t) {
            var lastSymbolToken = _.last(symbolToken);

            // An identifier is part of the previous symbol if it has a trailing
            // dot.
            if (_.contains(identifierTypes, t.type)) {
                if (_s.endsWith(lastSymbolToken.string, '.')) {
                    symbolToken.push(t);
                    return false;
                } else {
                    return true;
                }
            }

            // A dot is part of the previous symbol if it does not have a
            // trailing dot.
            if (isDot(t)) {
                if (!_s.endsWith(lastSymbolToken.string, '.')) {
                    symbolToken.push(t);
                    return false;
                } else {
                    return true;
                }
            }

            // Skip any whitespace.
            if (_.contains(Type.NON_CODE_TYPES, t.type)) {
                return false;
            }

            // This is the end of the identifier. Stop iterating.
            return true;
        });
    }

    if (symbolToken) {
        return _.pluck(symbolToken, 'string').join('');
    } else {
        return '';
    }
};


/**
 * Determines if the given START_BLOCK is part of a goog.scope statement.
 * @param {Token} token A token of type START_BLOCK.
 * @return {?Token} The goog.scope function call token, or null if such call
 *      doesn't exist.
 */
var googScopeOrNoneFromStartBlock = function(token) {
    if (token.type != Type.START_BLOCK) {
        return null;
    }

    // Search for a goog.scope statement, which will be 5 tokens before the
    // block. Illustration of the tokens found prior to the start block:
    // goog.scope(function() {
    //      5    4    3   21 ^

    var maybeGoogScope = token;
    _.each(_.range(5), function() {
        maybeGoogScope = (maybeGoogScope && maybeGoogScope.previous) ?
                maybeGoogScope.previous : null;
    });

    if (maybeGoogScope && maybeGoogScope.string == 'goog.scope') {
        return maybeGoogScope;
    } else {
        return null;
    }
};


/**
 * Get string after token.
 * @param {Token} token Search will be done after this token.
 * @return {?string}  String if found after token else null (empty string will
 *      also return null).
 */
var getStringAfterToken = function(token) {
    // Search until end of string as in case of empty string Type.STRING_TEXT
    // is not present/found and don't want to return next string.
    // E.g.
    //  a = '';
    // b = 'test';
    // When searching for string after 'a' if search is not limited by end of
    // string then it will return 'test' which is not desirable as there is
    // a empty string before that.
    //
    // This will return None for cases where string is empty or no string found
    // as in both cases there is no Type.STRING_TEXT.

    var stringToken = searchUntil(token, [Type.STRING_TEXT],
                [Type.SINGLE_QUOTE_STRING_END, Type.DOUBLE_QUOTE_STRING_END]);
    if (stringToken) {
        return stringToken.string;
    } else {
        return null;
    }
};


/**
 * Returns the first token in an identifier.
 *
 * Given a token which is part of an identifier, returns the token at the start
 * of the identifier.
 * @param {Token} token A token which is part of an identifier.
 * @return {?Token} The token at the start of the identifier or None if the
 *      identifier was not of the form 'a.b.c' (e.g. "['a']['b'].c").
 */
var getIdentifierStart = function(token) {
    var startToken = token;
    var previousCodeToken = getPreviousCodeToken(token);

    while (previousCodeToken && (previousCodeToken.isType(Type.IDENTIFIER) ||
            isDot(previousCodeToken))) {
        startToken = previousCodeToken;
        previousCodeToken = getPreviousCodeToken(previousCodeToken);
    }

    if (isDot(startToken)) {
        return null;
    }

    return startToken;
};


/**
 * Returns the first token in the same line as token.
 * @param {Token} token Any token in the line.
 * @return {Token} The first token in the same line as token.
 */
var getFirstTokenInSameLine = function(token) {
    while (!token.isFirstInLine()) {
        token = token.previous;
    }
    return token;
};


/**
 * Returns the last token in the same line as token.
 * @param {Token} token Any token in the line.
 * @return {Token} The last token in the same line as token.
 */
var getLastTokenInSameLine = function(token) {
    while (!token.isLastInLine()) {
        token = token.next;
    }
    return token;
};


/**
 * Returns all tokens in the same line as the given token.
 * @param {Token} token Any token in the line.
 * @returns {Array.<Token>} All tokens on the same line as the given token.
 */
var getAllTokensInSameLine = function(token) {
    var firstToken = getFirstTokenInSameLine(token);
    var lastToken = getLastTokenInSameLine(token);

    var tokensInLine = [];
    while (firstToken != lastToken) {
        tokensInLine.push(firstToken);
        firstToken = firstToken.next;
    }
    tokensInLine.push(lastToken);

    return tokensInLine;
};


/**
 * Returns the first token in the previous line as token.
 * @param {Token} token Any token in the line.
 * @return {?Token} The first token in the previous line as token, or null
 *      if token is on the first line.
 */
var getFirstTokenInPreviousLine = function(token) {
    var firstInLine = getFirstTokenInSameLine(token);
    if (firstInLine.previous) {
        return getFirstTokenInSameLine(firstInLine.previous);
    }

    return null;
};


/**
 * Returns a list of tokens between the two given, inclusive.
 * @param {Token} startToken Start token in the range.
 * @param {Token} endToken End token in the range.
 * @return {?Array.<Token>} A list of tokens, in order, from startToken to
 *      endToken (including start and end).  Returns null if the tokens do not
 *      describe a valid range.
 */
var getTokenRange = function(startToken, endToken) {
    var tokenRange = [];
    var token = startToken;
    while (token) {
        tokenRange.push(token);
        if (token == endToken) {
            return tokenRange;
        }
        token = token.next;
    }

    return null;
};

/**
 * Whether the token represents a "dot" operator (foo.bar).
 * @param {Token} token
 * @return {boolean}
 */
var isDot = function(token) {
    return token.type == Type.NORMAL && token.string == '.';
};


exports.googScopeOrNoneFromStartBlock = googScopeOrNoneFromStartBlock;
exports.compare = compare;
exports.customSearch = customSearch;
exports.getAllTokensInSameLine = getAllTokensInSameLine;
exports.getFirstTokenInPreviousLine = getFirstTokenInPreviousLine;
exports.getIdentifierStart = getIdentifierStart;
exports.getLastTokenInSameLine = getLastTokenInSameLine;
exports.getStringAfterToken = getStringAfterToken;
exports.getTokenRange = getTokenRange;
exports.search = search;
exports.searchExcept = searchExcept;
exports.searchUntil = searchUntil;
exports.getIdentifierForToken = getIdentifierForToken;
