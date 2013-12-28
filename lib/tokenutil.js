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
 * @returns {?Token} When true, search the tokens before this one instead of
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
 * @returns {?Token} The first token of any type in token_types within distance
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
 * @returns {?Token} The first token of any type in token_types within distance
 *      of this token, or null if no such token is found.
 */
var searchUntil = function(startToken, tokenTypes, endTypes, opt_distance,
                           opt_reverse) {
    return customSearch(startToken, function(token) {
        return token.isAnyType(tokenTypes);
    }, function(token) {
        return token.isAnyType(endTypes)
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
 * @returns {?Token} The first token of any type in token_types within distance
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
 * @returns {?Token} The code token before the specified token or null if no
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

    if (_.contains(identifierTypes, token.type)) {
        throw 'assert token.type in identifier_types';
    }

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
                if (!_.endsWith(lastSymbolToken.string, '.')) {
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
 * Whether the token represents a "dot" operator (foo.bar).
 * @param {Token} token
 * @returns {boolean}
 */
var isDot = function(token) {
    return token.type == Type.NORMAL && token.string == '.';
};


exports.compare = compare;
exports.customSearch = customSearch;
exports.search = search;
exports.searchExcept = searchExcept;
exports.searchUntil = searchUntil;
exports.getIdentifierForToken = getIdentifierForToken;
