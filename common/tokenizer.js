/**
 * Regular expression based lexer.
 */

var _ = require('underscore');
var _s = require('underscore.string');
var tokens = require('./tokens');
var Type = tokens.TokenType;
var Token = tokens.Token;

/**
 * General purpose tokenizer.
 * @param {JavaScriptModes} startingMode Mode to start in.  This allows
 *      patterns to distinguish if they are mid-comment, mid-parameter list,
 *      etc.
 * @param {Matcher} matchers Dictionary of modes to sequences of matchers
 *      that define the patterns to check at any given time.
 * @param {Array.<Type>} defaultTypes Dictionary of modes to types,
 *      defining what type to give non-matched text when in the given mode.
 *      Defaults to Type.NORMAL.
 * @constructor
 */
var Tokenizer = function(startingMode, matchers, defaultTypes) {
    this._startingMode = startingMode;
    this.matchers = matchers;
    this.defaultTypes = defaultTypes;
};


/**
 * Tokenizes the given file.
 * @param {string} file Content of the file.
 * @return {Token}
 */
Tokenizer.prototype.tokenizeFile = function(file) {
    this.mode = this._startingMode;
    this._firstToken = null;
    this._lastToken = null;
    this._lineNumber = 0;

    _.each(file.split('\n'), function(line) {
        this._lineNumber++;
        this._tokenizeLine(line);
    }, this);

    return this._firstToken;
};


/**
 * Creates a new Token object (or subclass).
 * @param {string} string The string of input the token represents.
 * @param {TokenType} tokenType The type of token.
 * @param {string} line The text of the line this token is in.
 * @param {number} lineNumber The line number of the token.
 * @param {Object} opt_values A dict of named values within the token.
 *      For instance, a function declaration may have a value called 'name'
 *      which captures the name of the function.
 * @return {Token} The newly created Token object.
 * @private
 */
Tokenizer.prototype._createToken = function(string, tokenType, line, lineNumber,
        opt_values) {
    return new Token(string, tokenType, line, lineNumber, opt_values,
            lineNumber);
};


/**
 * Tokenizes the given line.
 * @param {string} line The contents of the line.
 * @private
 */
Tokenizer.prototype._tokenizeLine = function(line) {
    var string = _s.rstrip(line, '\n\r\f');
    var lineNumber = this._lineNumber;
    this._startIndex = 0;

    if (!string) {
        this._addToken(this._createToken(
                '', Type.BLANK_LINE, line, lineNumber));
        return;
    }

    var normalToken = '';
    var index = 0;
    while (index < string.length) {
        var res = _.find(this.matchers[this.mode], function(matcher) {
            if (matcher.lineStart && index > 0) {
                return false;
            }

            matcher.regex.lastIndex = 0;
            var match = matcher.regex.exec(string.substr(index));

            if (match && match.index == 0) {
                if (normalToken) {
                    this._addToken(this._createNormalToken(
                            this.mode, normalToken, line, lineNumber));
                    normalToken = '';
                }

                // Add the match.
                this._addToken(this._createToken(
                        match[0], matcher.type, line, lineNumber, match));

                // Change the mode to the correct one for after this match.
                this.mode = matcher.resultMode || this.mode;

                // Shorten the string to be matched.
                index = index + match[0].length;

                return true;
            }
            return false;
        }, this);

        // If the for loop finishes naturally (i.e. no matches) we just add
        // the first character to the string of consecutive non match
        // characters. These will constitute a NORMAL token.
        if (!res && string) {
            normalToken += string.substr(index, 1);
            index++;
        }
    }

    if (normalToken) {
        this._addToken(this._createNormalToken(
                this.mode, normalToken, line, lineNumber));
    }
};


/**
 * Creates a normal token.
 * @param {JavaScriptModes} mode The current mode.
 * @param {string} string The string to tokenize.
 * @param {string} line The line of text.
 * @param {number} lineNumber The line number within the file.
 * @return {Token} A Token object, of the default type for the current mode.
 * @private
 */
Tokenizer.prototype._createNormalToken = function(mode, string, line,
                                                  lineNumber) {
    var type = Type.NORMAL;
    if (_.contains(this.defaultTypes, mode)) {
        type = this.defaultTypes[mode];
    }
    return this._createToken(string, type, line, lineNumber);
};


/**
 * Add the given token to the token stream.
 * @param {Token} token The token to add.
 * @private
 */
Tokenizer.prototype._addToken = function(token) {
    // Store the first token, or point the previous token to this one.
    if (!this._firstToken) {
        this._firstToken = token;
    } else {
        this._lastToken.next = token;
    }

    // Establish the doubly linked list.
    token.previous = this._lastToken;
    this._lastToken = token;

    token.startIndex = this._startIndex;
    this._startIndex += token.length;
};


exports.Tokenizer = Tokenizer;
