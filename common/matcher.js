/**
 * A token matcher.
 *
 * Specifies a pattern to match, the type of token it represents, what mode the
 * token changes to, and what mode the token applies to.
 *
 * Modes allow more advanced grammars to be incorporated, and are also necessary
 * to tokenize line by line.  We can have different patterns apply to different
 * modes - i.e. looking for documentation while in comment mode.
 *
 * @param regex
 * @param tokenType
 * @param opt_resultMode
 * @param opt_lineStart
 * @constructor
 */
var Matcher = function(regex, tokenType, opt_resultMode, opt_lineStart) {
    this.regex = regex;
    this.type = tokenType;
    this.resultMode = opt_resultMode || null;
    this.lineStart = opt_lineStart || false;
};


exports.Matcher = Matcher;
