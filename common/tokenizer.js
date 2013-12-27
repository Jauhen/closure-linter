var _ = require('underscore');
var _s = require('underscore.string');
var tokens = require('./tokens');
var Type = tokens.TokenType;


var Tokenizer = function(startingMode, matchers, defaultTypes) {
    this._startingMode = startingMode;
    this.matchers = matchers;
    this.defaultTypes = defaultTypes;
};

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

Tokenizer.prototype._createToken = function(string, tokenType, line, lineNumber,
        opt_values) {
    return new tokens.Token(string, tokenType, line, lineNumber, opt_values,
            lineNumber);
};

Tokenizer.prototype._tokenizeLine = function(line) {
    var string = _s.rstrip(line, '\n\r\f');
    var lineNumber = this._lineNumber;
    this._startIndex = 0;

    if (!string) {
        this._addToken(this._createToken('', Type.BLANK_LINE, line, lineNumber));
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

                this._addToken(this._createToken(
                        match[0], matcher.type, line, lineNumber, match));

                this.mode = matcher.resultMode || this.mode;

                index = index + match[0].length;

                return true;
            }
            return false;
        }, this);

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

Tokenizer.prototype._createNormalToken = function(mode, string, line,
                                                  lineNumber) {
    var type = Type.NORMAL;
    if (_.contains(this.defaultTypes, mode)) {
        type = this.defaultTypes[mode];
    }
    return this._createToken(string, type, line, lineNumber);
}


Tokenizer.prototype._addToken = function(token) {
    if (!this._firstToken) {
        this._firstToken = token;
    } else {
        this._lastToken.next = token;
    }

    token.previous = this._lastToken;
    this._lastToken = token;

    token.startIndex = this._startIndex;
    this._startIndex += token.length;
};


exports.Tokenizer = Tokenizer;
