/**
 * Classes to represent tokens and positions within them.
 */

var _ = require('underscore');
var _s = require('underscore.string');


/**
 * Token types common to all languages.
 * @enum {string}
 */
var TokenType = {
    NORMAL: 'normal',
    WHITESPACE: 'whitespace',
    BLANK_LINE: 'blank line'
};


/**
 * Token class for intelligent text splitting.
 * The token class represents a string of characters and an identifying type.
 *
 * @param {string} string The string of input the token contains.
 * @param {TokenType} tokenType The type of token.
 * @param {string} line The text of the line this token is in.
 * @param {number} lineNumber The line number of the token.
 * @param {Object} opt_values A dict of named values within the token.  For
 *      instance, a function declaration may have a value called 'name' which
 *      captures the name of the function.
 * @param {number} opt_origLineNumber The line number of the original file this
 *      token comes from. This should be only set during the tokenization
 *      process. For newly created error fix tokens after that, it should be
 *      null.
 * @constructor
 */
var Token = function(string, tokenType, line, lineNumber, opt_values,
                     opt_origLineNumber) {
    this.type = tokenType;
    this.string = string;
    this.length = string.length;
    this.line = line;
    this.lineNumber = lineNumber;
    this.origLineNumber = opt_origLineNumber || null;
    this.values = opt_values || null;
    this.isDeleted = false;

    // These parts can only be computed when the file is fully tokenized.
    this.previous = null;
    this.next = null;
    this.startIndex = null;

    // This part is set in statetracker.js.
    this.attachedObject = null;

    // This part is set in *metadatapass.py.
    this.metadata = null;
};


/**
 * Tests if this token is the first token in its line.
 * @return {boolean} Whether the token is the first token in its line.
 */
Token.prototype.isFirstInLine = function() {
    return !this.previous || this.previous.lineNumber != this.lineNumber;
};


/**
 * Tests if this token is the last token in its line.
 * @return {boolean} Whether the token is the last token in its line.
 */
Token.prototype.isLastInLine = function() {
    return !this.next || this.next.lineNumber != this.lineNumber;
};


/**
 * Tests if this token is of the given type.
 * @param {TokenType} tokenType The type to test for.
 * @return {boolean} True if the type of this token matches the type passed in.
 */
Token.prototype.isType = function(tokenType) {
    return this.type == tokenType;
};


/**
 * Tests if this token is any of the given types.
 * @param {Array.<TokenType>} tokenTypes The types to check.
 * @return {boolean} True if the type of this token is any of the types
 *      passed in.
 */
Token.prototype.isAnyType = function(tokenTypes) {
    return _.contains(tokenTypes, this.type);
};


/**
 * @return {string}
 */
Token.prototype.toString = function() {
    return _s.sprintf('<Token: %s, "%s", %s, %d, %s>',
            this.type, this.string, this.values,
            this.lineNumber, this.metadata);
};


/**
 * Returns a token iterator.
 * @return {Array.<Token>}
 */
Token.prototype.directIterator = function() {
    var current = this;
    var result = [];
    while (current) {
        result.push(current);
        current = current.next;
    }
    return result;
};


/**
 * Returns a reverse-direction token iterator.
 * @return {Array.<Token>}
 */
Token.prototype.reverseIterator = function() {
    var current = this;
    var result = [];
    while (current) {
        result.push(current);
        current = current.previous;
    }
    return result;
};


exports.TokenType = TokenType;
exports.Token = Token;
