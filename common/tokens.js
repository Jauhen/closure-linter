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
}


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


Token.prototype.isFirstInLine = function() {
    return !this.previous || this.previous.lineNumber != this.lineNumber;
};

Token.prototype.isLastInLine = function() {
    return !this.next || this.next.lineNumber != this.lineNumber;
};

Token.prototype.isType = function(tokenType) {
    return this.type == tokenType;
};

Token.prototype.isAnyType = function(tokenTypes) {
    return _.contains(tokenTypes, token.type);
};

Token.prototype.toString = function() {
    return _s.sprintf('<Token: %s, "%s", %r, %d, %r>',
            this.type, this.string, this.values,
            this.lineNumber, this.metadata);
}

Token.prototype.directIterator = function() {
    var current = this;
    var result = [];
    while (current) {
        result.push(current);
        current = current.next;
    }
    return result;
}

Token.prototype.reverseIterator = function() {
    var current = this;
    var result = [];
    while (current) {
        result.push(current);
        current = current.previous;
    }
    return result;
}


exports.TokenType = TokenType;
exports.Token = Token;
