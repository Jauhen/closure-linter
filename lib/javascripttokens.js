var _ = require('underscore');
var _s = require('underscore.string');

var tokens = require('../common/tokens');


var JavaScriptTokenType = {
    NUMBER: 'number',
    START_SINGLE_LINE_COMMENT: '//',
    START_BLOCK_COMMENT: '/*',
    START_DOC_COMMENT: '/**',
    END_BLOCK_COMMENT: '*/',
    END_DOC_COMMENT: 'doc */',
    COMMENT: 'comment',
    SINGLE_QUOTE_STRING_START: "'string",
    SINGLE_QUOTE_STRING_END: "string'",
    DOUBLE_QUOTE_STRING_START: '"string',
    DOUBLE_QUOTE_STRING_END: 'string"',
    STRING_TEXT: 'string',
    START_BLOCK: '{',
    END_BLOCK: '}',
    START_PAREN: '(',
    END_PAREN: ')',
    START_BRACKET: '[',
    END_BRACKET: ']',
    REGEX: '/regex/',
    FUNCTION_DECLARATION: 'function(...)',
    FUNCTION_NAME: 'function functionName(...)',
    START_PARAMETERS: 'startparams(',
    PARAMETERS: 'pa,ra,ms',
    END_PARAMETERS: ')endparams',
    SEMICOLON: ';',
    DOC_FLAG: '@flag',
    DOC_INLINE_FLAG: '{@flag ...}',
    DOC_START_BRACE: 'doc {',
    DOC_END_BRACE: 'doc }',
    DOC_PREFIX: 'comment prefix: * ',
    SIMPLE_LVALUE: 'lvalue=',
    KEYWORD: 'keyword',
    OPERATOR: 'operator',
    IDENTIFIER: 'identifier'
};

JavaScriptTokenType.STRING_TYPES = [
    JavaScriptTokenType.SINGLE_QUOTE_STRING_START,
    JavaScriptTokenType.SINGLE_QUOTE_STRING_END,
    JavaScriptTokenType.DOUBLE_QUOTE_STRING_START,
    JavaScriptTokenType.DOUBLE_QUOTE_STRING_END,
    JavaScriptTokenType.STRING_TEXT];

JavaScriptTokenType.COMMENT_TYPES = [
    JavaScriptTokenType.START_SINGLE_LINE_COMMENT,
    JavaScriptTokenType.COMMENT,
    JavaScriptTokenType.START_BLOCK_COMMENT,
    JavaScriptTokenType.START_DOC_COMMENT,
    JavaScriptTokenType.END_BLOCK_COMMENT,
    JavaScriptTokenType.END_DOC_COMMENT,
    JavaScriptTokenType.DOC_START_BRACE,
    JavaScriptTokenType.DOC_END_BRACE,
    JavaScriptTokenType.DOC_FLAG,
    JavaScriptTokenType.DOC_INLINE_FLAG,
    JavaScriptTokenType.DOC_PREFIX];

JavaScriptTokenType.FLAG_DESCRIPTION_TYPES = [
    JavaScriptTokenType.DOC_INLINE_FLAG,
    JavaScriptTokenType.COMMENT,
    JavaScriptTokenType.DOC_START_BRACE,
    JavaScriptTokenType.DOC_END_BRACE];

JavaScriptTokenType.FLAG_ENDING_TYPES = [
    JavaScriptTokenType.DOC_FLAG,
    JavaScriptTokenType.END_DOC_COMMENT];

JavaScriptTokenType.NON_CODE_TYPES = _.union(
    JavaScriptTokenType.COMMENT_TYPES, [
        tokens.TokenType.WHITESPACE,
        tokens.TokenType.BLANK_LINE]);

JavaScriptTokenType.UNARY_OPERATORS = ['!', 'new', 'delete', 'typeof', 'void'];

JavaScriptTokenType.UNARY_OK_OPERATORS = _.union(['--', '++', '-', '+'],
    JavaScriptTokenType.UNARY_OPERATORS);

JavaScriptTokenType.UNARY_POST_OPERATORS = ['--', '++'];

// An expression ender is any token that can end an object - i.e. we could have,
// x.y or [1, 2], or (10 + 9) or {a: 10}.,
JavaScriptTokenType.EXPRESSION_ENDER_TYPES = [
    tokens.TokenType.NORMAL,
    JavaScriptTokenType.IDENTIFIER,
    JavaScriptTokenType.NUMBER,
    JavaScriptTokenType.SIMPLE_LVALUE,
    JavaScriptTokenType.END_BRACKET,
    JavaScriptTokenType.END_PAREN,
    JavaScriptTokenType.END_BLOCK,
    JavaScriptTokenType.SINGLE_QUOTE_STRING_END,
    JavaScriptTokenType.DOUBLE_QUOTE_STRING_END];


var JavaScriptToken = function() {
    tokens.Token.apply(this, arguments);
};
_.extend(JavaScriptToken.prototype, tokens.Token.prototype);


JavaScriptToken.prototype.isKeyword = function(keyword) {
    return this.type == JavaScriptTokenType.KEYWORD && this.string == keyword;
};

JavaScriptToken.prototype.isOperator = function(operator) {
    return this.type == JavaScriptTokenType.OPERATOR && this.string == operator;
};

JavaScriptToken.prototype.isAssignment = function() {
    return this.type == JavaScriptTokenType.OPERATOR &&
            _s.endsWith(this.string, '=') &&
            !_.contains(['==', '!=', '>=', '<=', '===', '!=='], this.string);
};

JavaScriptToken.prototype.isComment = function() {
    return _.contains(JavaScriptTokenType.COMMENT_TYPES, this.type);
};

JavaScriptToken.prototype.isCode = function() {
    return !_.contains(JavaScriptTokenType.NON_CODE_TYPES, this.type);
};

JavaScriptToken.prototype.toString = function() {
    return _s.sprintf('<JavaScriptToken: %d, %s, "%s", %s, %s>',
        this.lineNumber, this.type, this.string, this.values, this.metadata);
};

exports.JavaScriptTokenType = JavaScriptTokenType;
exports.JavaScriptToken = JavaScriptToken;
