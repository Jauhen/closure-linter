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
 * @param {Function(Token):boolean} func The function to call to test a token
 *      for applicability.
 * @param {Function(Token):boolean} opt_endFunc The function to call to test
 *      a token to determine whether to abort the search.
 * @param {?number} opt_distance The number of tokens to look through before
 *      failing search.  Must be positive.  If unspecified, will search until
 *      the end of the token chain.
 * @param {boolean} opt_reverse When true, search the tokens before this one
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
 * @param {TokenType} tokenTypes The unallowable types of the token being
 *      searched for.
 * @param {number} opt_distance The number of tokens to look through before
 *      failing search.  Must be positive.  If unspecified, will search until
 *      the end of the token chain.
 * @param {boolean} opt_reverse When true, search the tokens before this one
 *      instead of the tokens after it.
 * @returns {Token} The first token of any type in token_types within distance
 *      of this token, or null if no such token is found.
 */
var searchExcept = function(startToken, tokenTypes, opt_distance, opt_reverse) {
    return customSearch(startToken,
            function(token) {return !token.isAnyType(tokenTypes)},
            null, opt_distance || null, opt_reverse || false);
};


exports.compare = compare;
exports.searchExcept = searchExcept;
