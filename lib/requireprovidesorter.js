/**
 * Contains logic for sorting goog.provide and goog.require statements.
 *
 * Closurized JavaScript files use goog.provide and goog.require statements at
 * the top of the file to manage dependencies. These statements should be
 * sorted alphabetically, however, it is common for them to be accompanied by
 * inline comments or suppression annotations. In order to sort these statements
 * without disrupting their comments and annotations, the association between
 * statements and comments/annotations must be maintained while sorting.
 */


var _ = require('underscore');
var javascriptTokens = require('./javascripttokens');
var tokenUtil = require('./tokenutil');

var Type = javascriptTokens.JavaScriptTokenType;


/**
 * Checks for and fixes alphabetization of provide and require statements.
 *
 * When alphabetizing, comments on the same line or comments directly above a
 * goog.provide or goog.require statement are associated with that statement and
 * stay with the statement as it gets sorted.
 * @constructor
 */
var RequireProvideSorter = function() {};


/**
 * Checks alphabetization of goog.provide statements.
 *
 * Iterates over tokens in given token stream, identifies goog.provide tokens,
 * and checks that they occur in alphabetical order by the object being
 * provided.
 * @param {Token} token A token in the token stream before any goog.provide
 *      tokens.
 * @returns {?Token} The first provide token in the token stream.
 *      Null is returned if all goog.provide statements are already sorted.
 */
RequireProvideSorter.prototype.checkProvides = function(token) {
    var provideTokens = this._getRequireOrProvideTokens(token, 'goog.provide');
    var provideStrings = this._getRequireOrProvideTokenStrings(provideTokens);
    var sortedProvideStrings = _.map(provideStrings, _.identity).sort();
    if (!_.isEqual(provideStrings, sortedProvideStrings)) {
        return provideTokens[0];
    }
    return null;
};


/**
 * Checks alphabetization of goog.require statements.
 *
 * Iterates over tokens in given token stream, identifies goog.require tokens,
 * and checks that they occur in alphabetical order by the dependency being
 * required.
 * @param {Token} token A token in the token stream before any goog.require
 *      tokens.
 * @return {?Token} The first require token in the token stream.
 *      Null is returned if all goog.require statements are already sorted.
 */
RequireProvideSorter.prototype.checkRequires = function(token) {
    var requireTokens = this._getRequireOrProvideTokens(token, 'goog.require');
    var requireStrings = this._getRequireOrProvideTokenStrings(requireTokens);
    var sortedRequireStrings = _.map(requireStrings, _.identity).sort();
    if (!_.isEqual(requireStrings, sortedRequireStrings)) {
        return requireTokens[0];
    }
    return null;
};


/**
 * Get fixed/sorted order of goog.provide statements.
 * @param {Token} token The first token in the token stream.
 * @return {string} A string for correct sorted order of goog.provide.
 */
RequireProvideSorter.prototype.getFixedProvideString = function(token) {
    return this._getFixedRequireOrProvideString(
            this._getRequireOrProvideTokens(token, 'goog.provide'));
};


/**
 * Get fixed/sorted order of goog.require statements.
 * @param {Token} token The first token in the token stream.
 * @return {string} A string for correct sorted order of goog.require.
 */
RequireProvideSorter.prototype.getFixedRequireString = function(token) {
    return this._getFixedRequireOrProvideString(
            this._getRequireOrProvideTokens(token, 'goog.require'));
};


/**
 * Gets all goog.provide or goog.require tokens in the given token stream.
 * @param {Token} token The first token in the token stream.
 * @param {strong} tokenString One of 'goog.provide' or 'goog.require' to
 *      indicate which tokens to find.
 * @return {Array.<Token>} A list of goog.provide or goog.require tokens in
 *      the order they appear in the token stream.
 * @private
 */
RequireProvideSorter.prototype._getRequireOrProvideTokens = function(token,
        tokenString) {
    var tokens = [];
    while (token) {
        if (token.type == Type.IDENTIFIER) {
            if (token.string == tokenString) {
                tokens.push(token);
            } else if (!_.contains(['goog.provide', 'goog.require',
                'goog.setTestOnly'], token.string)) {
                // These 3 identifiers are at the top of the file. So if any
                // other identifier is encountered, return.
                break;
            }
        }
        token = token.next;
    }
    return tokens;
};


/**
 * Gets a list of strings corresponding to the given list of tokens.
 *
 * The string will be the next string in the token stream after each token in
 * tokens. This is used to find the object being provided/required by a given
 * goog.provide or goog.require token.
 * @param {Array.<Token>} tokens A list of goog.provide or goog.require tokens.
 * @return {Array.<string>} A list of object names that are being provided or
 *      required by the given list of tokens. For example:
 *      ['object.a', 'object.c', 'object.b']
 * @private
 */
RequireProvideSorter.prototype._getRequireOrProvideTokenStrings =
        function(tokens) {
    var tokenStrings = [];
    _.each(tokens, function(token) {
        var name = tokenUtil.getStringAfterToken(token);
        tokenStrings.push(name);
    });
    return tokenStrings;
};


/**
 * Sorts goog.provide or goog.require statements.
 * @param {Array.<Token>} tokens A list of goog.provide or goog.require tokens
 *      in the order they appear in the token stream. i.e. the first token in
 *      this list must be the first goog.provide or goog.require token.
 * @returns {string} A string for sorted goog.require or goog.provide
 *      statements.
 * @private
 */
RequireProvideSorter.prototype._getFixedRequireOrProvideString =
        function(tokens) {
    var tokensMap = this._getTokensMap(tokens);
    var sortedStrings = _.keys(tokensMap).sort();

    var newOrder = '';
    _.each(sortedStrings, function(string) {
        _.each(tokensMap[string], function(t) {
            newOrder += t.string;
            if (t.isLastInLine()) {
                newOrder += '\n';
            }
        });
    });

    return newOrder;
};


/**
 * Gets a map from object name to tokens associated with that object.
 *
 * Starting from the goog.provide/goog.require token, searches backwards in the
 * token stream for any lines that start with a comment. These lines are
 * associated with the goog.provide/goog.require token. Also associates any
 * tokens on the same line as the goog.provide/goog.require token with that
 * token.
 * @param {Array.<Token>} tokens A list of goog.provide or goog.require tokens.
 * @return {{string: Array.<Token>}} A dictionary that maps object names to
 *      the tokens associated with the goog.provide or goog.require of that
 *      object name. For example:
 *      {
 *          'object.a': [JavaScriptToken, JavaScriptToken, ...],
 *          'object.b': [...]
 *      }
 *
 *      The list of tokens includes any comment lines above the goog.provide
 *      or goog.require statement and everything after the statement on the
 *      same line. For example, all of the following would be associated with
 *      'object.a':
 *      /** @suppress {extraRequire} * /
 *      goog.require('object.a'); // Some comment.
 * @private
 */
RequireProvideSorter.prototype._getTokensMap = function(tokens) {
    var tokensMap = {};
    _.each(tokens, function(token) {
        var objectName = tokenUtil.getStringAfterToken(token);
        // If the previous line starts with a comment, presume that the comment
        // relates to the goog.require or goog.provide and keep them together
        // when sorting.
        var firstToken = token;
        var previousFirstToken = tokenUtil.getFirstTokenInPreviousLine(
                firstToken);
        while (previousFirstToken &&
                previousFirstToken.isAnyType(Type.COMMENT_TYPES)) {
            firstToken = previousFirstToken;
            previousFirstToken = tokenUtil.getFirstTokenInPreviousLine(
                    firstToken);
        }

        // Find the last token on the line.
        var lastToken = tokenUtil.getLastTokenInSameLine(token);

        var allTokens = this._getTokenList(firstToken, lastToken);
        tokensMap[objectName] = allTokens;
    }, this);

    return tokensMap;
};


/**
 * Gets a list of all tokens from first_token to last_token, inclusive.
 * @param {Token} firstToken The first token to get.
 * @param {Token} lastToken The last token to get.
 * @return {Array.<Token>} A list of all tokens between firstToken and
 *      lastToken, including both firstToken and lastToken.
 * @private
 */
RequireProvideSorter.prototype._getTokenList = function(firstToken, lastToken) {
    var tokenList = [];
    var token = firstToken;
    while (token != lastToken) {
        if (!token) {
            throw 'Ran out of tokens.'
        }
        tokenList.push(token);
        token = token.next;
    }
    tokenList.push(lastToken);

    return tokenList;
};


exports.RequireProvideSorter = RequireProvideSorter;
