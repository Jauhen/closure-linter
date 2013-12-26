var _ = require('underscore');
var _s = require('underscore.string');

var javascriptTokens = require('./javascripttokens');
var matcher = require('../common/matcher');
var tokenizer = require('../common/tokenizer');

var Type = javascriptTokens.JavaScriptTokenType;
var Matcher = matcher.Matcher;


var JavaScriptModes = {
    TEXT_MODE: 'text',
    SINGLE_QUOTE_STRING_MODE: 'single_quote_string',
    DOUBLE_QUOTE_STRING_MODE: 'double_quote_string',
    BLOCK_COMMENT_MODE: 'block_comment',
    DOC_COMMENT_MODE: 'doc_comment',
    DOC_COMMENT_LEX_SPACES_MODE: 'doc_comment_spaces',
    LINE_COMMENT_MODE: 'line_comment',
    PARAMETER_MODE: 'parameter',
    FUNCTION_MODE: 'function'
};

var JavaScriptTokenizer = function(opt_parseJsDoc) {
    var parseJsDoc = opt_parseJsDoc || true;
    var matchers = JavaScriptTokenizer.JAVASCRIPT_MATCHERS;

    tokenizer.Tokenizer.call(this, JavaScriptModes.TEXT_MODE, matchers,
            JavaScriptTokenizer.JAVASCRIPT_DEFAULT_TYPES);
};
_.extend(JavaScriptTokenizer.prototype, tokenizer.Tokenizer.prototype);

JavaScriptTokenizer.prototype._createToken = function(string, tokenType, line,
        lineNumber, opt_values) {
    return new javascriptTokens.JavaScriptToken(string, tokenType, line,
            lineNumber, opt_values, lineNumber);
};

// Useful patterns for JavaScript parsing.
JavaScriptTokenizer.IDENTIFIER_CHAR = 'A-Za-z0-9_$\\.';

// Number patterns based on:
// http://www.mozilla.org/js/language/js20-2000-07/formal/lexer-grammar.html
JavaScriptTokenizer.MANTISSA =
    '(\\d+(?!\\.)) |' +    // Matches '10'
    '(\\d+\\.(?!\\d)) |' + // Matches '10.'
    '(\\d*\\.\\d+)';       // Matches '.5' or '10.5'

JavaScriptTokenizer.DECIMAL_LITERAL = _s.sprintf('(%s)([eE][-+]?\\d+)?',
        JavaScriptTokenizer.MANTISSA);
JavaScriptTokenizer.HEX_LITERAL = '0[xX][0-9a-fA-F]+';
JavaScriptTokenizer.NUMBER = RegExp(_s.sprintf('((%s)|(%s))',
        JavaScriptTokenizer.HEX_LITERAL, JavaScriptTokenizer.DECIMAL_LITERAL));


// Strings come in three parts - first we match the start of the string, then
// the contents, then the end.  The contents consist of any character except a
// backslash or end of string, or a backslash followed by any character, or a
// backslash followed by end of line to support correct parsing of multi-line
// strings.
JavaScriptTokenizer.SINGLE_QUOTE = /'/;
JavaScriptTokenizer.SINGLE_QUOTE_TEXT = /([^'\\]|\\(.|$))+/;
JavaScriptTokenizer.DOUBLE_QUOTE = /"/;
JavaScriptTokenizer.DOUBLE_QUOTE_TEXT = /([^"\\]|\\(.|$))+/;

JavaScriptTokenizer.START_SINGLE_LINE_COMMENT = /\/\//;
JavaScriptTokenizer.END_OF_LINE_SINGLE_LINE_COMMENT = /\/\/$/;

JavaScriptTokenizer.START_DOC_COMMENT = /\/\*\*/;
JavaScriptTokenizer.START_BLOCK_COMMENT = /\/\*/;
JavaScriptTokenizer.END_BLOCK_COMMENT = /\*\//;
JavaScriptTokenizer.BLOCK_COMMENT_TEXT = /([^\*]|\*(?!\/))+/;

// Comment text is anything that we are not going to parse into another special
// token like (inline) flags or end comments. Complicated regex to match
// most normal characters, and '*', '{', '}', and '@' when we are sure that
// it is safe. Expression [^*{\s]@ must come first, or the other options will
// match everything before @, and we won't match @'s that aren't part of flags
// like in email addresses in the @author tag.
JavaScriptTokenizer.DOC_COMMENT_TEXT = /([^\*\{}\s]@|[^\*\{}@]|\*(?!\/))+/;
JavaScriptTokenizer.DOC_COMMENT_NO_SPACES_TEXT =
        /([^\*\{}\s]@|[^\*\{}@\s]|\*(?!\/))+/;

// Match the prefix ' * ' that starts every line of jsdoc. Want to include
// spaces after the '*', but nothing else that occurs after a '*', and don't
// want to match the '*' in '*/'.
JavaScriptTokenizer.DOC_PREFIX = /\s*\*(\s+|(?!\/))/;

JavaScriptTokenizer.START_BLOCK = /{/;
JavaScriptTokenizer.END_BLOCK = /}/;

JavaScriptTokenizer.REGEX_CHARACTER_CLASS =
    '\\[' +                 // Opening bracket
    '([^\\]\\\\]|\\\\.)*' + // Anything but a ] or \,
                            // or a backslash followed by anything
    '\\]';                  // Closing bracket

// We ensure the regex is followed by one of the above tokens to avoid
// incorrectly parsing something like x / y / z as x REGEX(/ y /) z
JavaScriptTokenizer.POST_REGEX_LIST = [
    ';', ',', '\\.', '\\)', ']', '$', '//', '/*', ':', '}'];

JavaScriptTokenizer.REGEX = RegExp(_s.sprintf(
    '/' +                           // opening slash
    '(?!\\*)' +                     // not the start of a comment
    '(\\\\.|[^\\[\\/\\\\]|(%s))*' + // a backslash followed by anything,
                                    // or anything but a / or [ or \,
                                    // or a character class
    '/' +                           // closing slash
    '[gimsx]*' +                    // optional modifiers
    '(?=\\s*(%s))', JavaScriptTokenizer.REGEX_CHARACTER_CLASS,
        JavaScriptTokenizer.POST_REGEX_LIST.join('|')));


JavaScriptTokenizer.ANYTHING = /.*/;
JavaScriptTokenizer.PARAMETERS = /[^)]+/;
JavaScriptTokenizer.CLOSING_PAREN_WITH_SPACE = /\)\s*/;

JavaScriptTokenizer.FUNCTION_DECLARATION = /\bfunction\b/;

JavaScriptTokenizer.OPENING_PAREN = /\(/;
JavaScriptTokenizer.CLOSING_PAREN = /\)/;

JavaScriptTokenizer.OPENING_BRACKET = /\[/;
JavaScriptTokenizer.CLOSING_BRACKET = /]/;

// We omit these JS keywords from the list:
//   function - covered by FUNCTION_DECLARATION.
//   delete, in, instanceof, new, typeof - included as operators.
//   this - included in identifiers.
//   null, undefined - not included, should go in some "special constant" list.
JavaScriptTokenizer.KEYWORD_LIST = ['break', 'case', 'catch', 'continue',
    'default', 'do', 'else', 'finally', 'for', 'if', 'return', 'switch',
    'throw', 'try', 'var', 'while', 'with'];

// Match a keyword string followed by a non-identifier character in order to
// not match something like doSomething as do + Something.
JavaScriptTokenizer.KEYWORD = RegExp(_s.sprintf('(%s)((?=[^%s])|$)',
        JavaScriptTokenizer.KEYWORD_LIST.join('|'),
        JavaScriptTokenizer.IDENTIFIER_CHAR));

// List of regular expressions to match as operators.  Some notes: for our
// purposes, the comma behaves similarly enough to a normal operator that we
// include it here.  r'\bin\b' actually matches 'in' surrounded by boundary
// characters - this may not match some very esoteric uses of the in operator.
// Operators that are subsets of larger operators must come later in this list
// for proper matching, e.g., '>>' must come AFTER '>>>'.
JavaScriptTokenizer.OPERATOR_LIST = [',', '\\+\\+', '===', '!==', '>>>=', '>>>',
    '==', '>=', '<=', '!=', '<<=', '>>=', '<<', '>>', '>', '<', '\\+=', '\\+',
    '--', '\\^=', '-=', '-', '/=', '/', '\\*=', '\\*', '%=', '%', '&&',
    '\\|\\|', '&=', '&', '\\|=', '\\|', '=', '!', ':', '\\?', '\\^',
    '\\bdelete\\b', '\\bin\\b', '\\binstanceof\\b', '\\bnew\\b', '\\btypeof\\b',
    '\\bvoid\\b'];

JavaScriptTokenizer.OPERATOR = RegExp(
        JavaScriptTokenizer.OPERATOR_LIST.join('|'));

JavaScriptTokenizer.WHITESPACE = /\s+/;
JavaScriptTokenizer.SEMICOLON = /;/;

// Technically JavaScript identifiers can't contain '.', but we treat a set of
// nested identifiers as a single identifier.
JavaScriptTokenizer.NESTED_IDENTIFIER = _s.sprintf('[a-zA-Z_$][%s.]*',
    JavaScriptTokenizer.IDENTIFIER_CHAR);
JavaScriptTokenizer.IDENTIFIER = RegExp(JavaScriptTokenizer.NESTED_IDENTIFIER);

JavaScriptTokenizer.SIMPLE_LVALUE = RegExp(_s.sprintf(
    '(%s)' +      // a valid identifier
    '(?=\\s*' +   // optional whitespace
    '\\=' +       // look ahead to equal sign
    '(?!=))',     // not follwed by equal
        JavaScriptTokenizer.NESTED_IDENTIFIER));

// A doc flag is a @ sign followed by non-space characters that appears at the
// beginning of the line, after whitespace, or after a '{'.  The look-behind
// check is necessary to not match someone@google.com as a flag.
// TODO(Jauhen): JS is not support positive lookbehind assertion, so space
// before doc flag is also matched.
JavaScriptTokenizer.DOC_FLAG = /(^|(?:\s))@([a-zA-Z]+)/;

// To properly parse parameter names, we need to tokenize whitespace into a
// token.
// TODO(Jauhen): JS is not support positive lookbehind assertion, so space
// before doc flag is also matched.
JavaScriptTokenizer.DOC_FLAG_LEX_SPACES = /(^|(?:\s))@(param)\b/;

// TODO(Jauhen): JS is not support positive lookbehind assertion, so space
// before doc flag is also matched.
JavaScriptTokenizer.DOC_INLINE_FLAG = /(?:\{)@([a-zA-Z]+)/;

// Star followed by non-slash, i.e a star that does not end a comment.
// This is used for TYPE_GROUP below.
JavaScriptTokenizer.SAFE_STAR = '(\\*(?!/))';

JavaScriptTokenizer.COMMON_DOC_MATCHERS = [
    // Find the end of the comment.
    new Matcher(JavaScriptTokenizer.END_BLOCK_COMMENT, Type.END_DOC_COMMENT,
        JavaScriptModes.TEXT_MODE),

    // Tokenize documented flags like @private.
    new Matcher(JavaScriptTokenizer.DOC_INLINE_FLAG, Type.DOC_INLINE_FLAG),
    new Matcher(JavaScriptTokenizer.DOC_FLAG_LEX_SPACES, Type.DOC_FLAG,
        JavaScriptModes.DOC_COMMENT_LEX_SPACES_MODE),

    // Encountering a doc flag should leave lex spaces mode.
    new Matcher(JavaScriptTokenizer.DOC_FLAG, Type.DOC_FLAG,
            JavaScriptModes.DOC_COMMENT_MODE),

    // Tokenize braces so we can find types.
    new Matcher(JavaScriptTokenizer.START_BLOCK, Type.DOC_START_BRACE),
    new Matcher(JavaScriptTokenizer.END_BLOCK, Type.DOC_END_BRACE),
    new Matcher(JavaScriptTokenizer.DOC_PREFIX, Type.DOC_PREFIX, null, true)];


// The token matcher groups work as follows: it is an list of  Matcher objects.
// The matchers will be tried in this order, and the first to match will be
// returned.  Hence the order is important because the matchers that come first
// overrule the matchers that come later.
JavaScriptTokenizer.JAVASCRIPT_MATCHERS = {};

// Matchers for basic text mode.
JavaScriptTokenizer.JAVASCRIPT_MATCHERS[JavaScriptModes.TEXT_MODE] = [
    // Check a big group - strings, starting comments, and regexes - all
    // of which could be intertwined.  'string with /regex/',
    // /regex with 'string'/, /* comment with /regex/ and string */ (and so
    // on)
    new Matcher(JavaScriptTokenizer.START_DOC_COMMENT,
            Type.START_DOC_COMMENT, JavaScriptModes.DOC_COMMENT_MODE),
    new Matcher(JavaScriptTokenizer.START_BLOCK_COMMENT,
            Type.START_BLOCK_COMMENT, JavaScriptModes.BLOCK_COMMENT_MODE),
    new Matcher(JavaScriptTokenizer.END_OF_LINE_SINGLE_LINE_COMMENT,
            Type.START_SINGLE_LINE_COMMENT),
    new Matcher(JavaScriptTokenizer.START_SINGLE_LINE_COMMENT,
            Type.START_SINGLE_LINE_COMMENT, JavaScriptModes.LINE_COMMENT_MODE),
    new Matcher(JavaScriptTokenizer.SINGLE_QUOTE,
            Type.SINGLE_QUOTE_STRING_START,
            JavaScriptModes.SINGLE_QUOTE_STRING_MODE),
    new Matcher(JavaScriptTokenizer.DOUBLE_QUOTE,
            Type.DOUBLE_QUOTE_STRING_START,
            JavaScriptModes.DOUBLE_QUOTE_STRING_MODE),
    new Matcher(JavaScriptTokenizer.REGEX, Type.REGEX),

    // Next we check for start blocks appearing outside any of the items above.
    new Matcher(JavaScriptTokenizer.START_BLOCK, Type.START_BLOCK),
    new Matcher(JavaScriptTokenizer.END_BLOCK, Type.END_BLOCK),

    // Then we search for function declarations.
    new Matcher(JavaScriptTokenizer.FUNCTION_DECLARATION,
            Type.FUNCTION_DECLARATION, JavaScriptModes.FUNCTION_MODE),

    // Next, we convert non-function related parens to tokens.
    new Matcher(JavaScriptTokenizer.OPENING_PAREN, Type.START_PAREN),
    new Matcher(JavaScriptTokenizer.CLOSING_PAREN, Type.END_PAREN),

    // Next, we convert brackets to tokens.
    new Matcher(JavaScriptTokenizer.OPENING_BRACKET, Type.START_BRACKET),
    new Matcher(JavaScriptTokenizer.CLOSING_BRACKET, Type.END_BRACKET),

    // Find numbers.  This has to happen before operators because scientific
    // notation numbers can have + and - in them.
    new Matcher(JavaScriptTokenizer.NUMBER, Type.NUMBER),

    // Find operators and simple assignments
    new Matcher(JavaScriptTokenizer.SIMPLE_LVALUE, Type.SIMPLE_LVALUE),
    new Matcher(JavaScriptTokenizer.OPERATOR, Type.OPERATOR),

    // Find key words and whitespace.
    new Matcher(JavaScriptTokenizer.KEYWORD, Type.KEYWORD),
    new Matcher(JavaScriptTokenizer.WHITESPACE, Type.WHITESPACE),

    // Find identifiers.
    new Matcher(JavaScriptTokenizer.IDENTIFIER, Type.IDENTIFIER),

    // Finally, we convert semicolons to tokens.
    new Matcher(JavaScriptTokenizer.SEMICOLON, Type.SEMICOLON)];


// Matchers for single quote strings.
JavaScriptTokenizer.JAVASCRIPT_MATCHERS[
        JavaScriptModes.SINGLE_QUOTE_STRING_MODE] = [
    new Matcher(JavaScriptTokenizer.SINGLE_QUOTE_TEXT, Type.STRING_TEXT),
    new Matcher(JavaScriptTokenizer.SINGLE_QUOTE, Type.SINGLE_QUOTE_STRING_END,
                JavaScriptModes.TEXT_MODE)];


// Matchers for double quote strings.
JavaScriptTokenizer.JAVASCRIPT_MATCHERS[
        JavaScriptModes.DOUBLE_QUOTE_STRING_MODE] = [
    new Matcher(JavaScriptTokenizer.DOUBLE_QUOTE_TEXT, Type.STRING_TEXT),
    new Matcher(JavaScriptTokenizer.DOUBLE_QUOTE, Type.DOUBLE_QUOTE_STRING_END,
                JavaScriptModes.TEXT_MODE)];

// Matchers for block comments.
JavaScriptTokenizer.JAVASCRIPT_MATCHERS[JavaScriptModes.BLOCK_COMMENT_MODE] = [
    // First we check for exiting a block comment.
    new Matcher(JavaScriptTokenizer.END_BLOCK_COMMENT, Type.END_BLOCK_COMMENT,
                JavaScriptModes.TEXT_MODE),

    // Match non-comment-ending text..
    new Matcher(JavaScriptTokenizer.BLOCK_COMMENT_TEXT, Type.COMMENT)];

// Matchers for doc comments.
JavaScriptTokenizer.JAVASCRIPT_MATCHERS[JavaScriptModes.DOC_COMMENT_MODE] =
    JavaScriptTokenizer.COMMON_DOC_MATCHERS.concat([
        new Matcher(JavaScriptTokenizer.DOC_COMMENT_TEXT, Type.COMMENT)]);

JavaScriptTokenizer.JAVASCRIPT_MATCHERS[
        JavaScriptModes.DOC_COMMENT_LEX_SPACES_MODE] =
        JavaScriptTokenizer.COMMON_DOC_MATCHERS.concat([
            new Matcher(JavaScriptTokenizer.WHITESPACE, Type.COMMENT),
            new Matcher(JavaScriptTokenizer.DOC_COMMENT_NO_SPACES_TEXT,
                    Type.COMMENT)]);

// Matchers for single line comments.
JavaScriptTokenizer.JAVASCRIPT_MATCHERS[JavaScriptModes.LINE_COMMENT_MODE] = [
    // We greedy match until the end of the line in line comment mode.
    new Matcher(JavaScriptTokenizer.ANYTHING, Type.COMMENT,
            JavaScriptModes.TEXT_MODE)];

// Matchers for code after the function keyword.
JavaScriptTokenizer.JAVASCRIPT_MATCHERS[JavaScriptModes.FUNCTION_MODE] = [
    // Must match open paren before anything else and move into parameter
    // mode, otherwise everything inside the parameter list is parsed
    // incorrectly.
    new Matcher(JavaScriptTokenizer.OPENING_PAREN, Type.START_PARAMETERS,
            JavaScriptModes.PARAMETER_MODE),
    new Matcher(JavaScriptTokenizer.WHITESPACE, Type.WHITESPACE),
    new Matcher(JavaScriptTokenizer.IDENTIFIER, Type.FUNCTION_NAME)];

// Matchers for function parameters
JavaScriptTokenizer.JAVASCRIPT_MATCHERS[JavaScriptModes.PARAMETER_MODE] = [
    // When in function parameter mode, a closing paren is treated specially.
    // Everything else is treated as lines of parameters.
    new Matcher(JavaScriptTokenizer.CLOSING_PAREN_WITH_SPACE,
            Type.END_PARAMETERS, JavaScriptModes.TEXT_MODE),
    new Matcher(JavaScriptTokenizer.PARAMETERS, Type.PARAMETERS,
            JavaScriptModes.PARAMETER_MODE)];

// When text is not matched, it is given this default type based on mode.
// If unspecified in this map, the default default is Type.NORMAL.
JavaScriptTokenizer.JAVASCRIPT_DEFAULT_TYPES = {};
JavaScriptTokenizer.JAVASCRIPT_DEFAULT_TYPES[JavaScriptModes.DOC_COMMENT_MODE] =
        Type.COMMENT;
JavaScriptTokenizer.JAVASCRIPT_DEFAULT_TYPES[
        JavaScriptModes.DOC_COMMENT_LEX_SPACES_MODE] = Type.COMMENT;


exports.JavaScriptModes = JavaScriptModes;
exports.JavaScriptTokenizer = JavaScriptTokenizer;
