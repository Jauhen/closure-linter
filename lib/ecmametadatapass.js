/**
 * Metadata pass for annotating tokens in EcmaScript files.
 */

var _ = require('underscore');
var _s = require('underscore.string');
var javascriptTokens = require('./javascripttokens');
var tokenUtil = require('./tokenutil');

var TokenType = javascriptTokens.JavaScriptTokenType;


/**
 * Exception indicating a parse error at the given token.
 *
 * @param {Token} token The token where the parse error occurred.
 * @param {?string} opt_message Exception message.
 * @constructor
 */
var ParseError = function(token, opt_message) {
    this.token = token;
    this.message = opt_message || '';
};


/**
 * Context object for EcmaScript languages.
 *
 * @param {EcmaContext.Type} contextType The context type.
 * @param {Token} startToken The token where this context starts.
 * @param {EcmaContext} opt_parent The parent context.
 * @constructor
 */
var EcmaContext = function(contextType, startToken, opt_parent) {
    /**
     * The context type.
     * @type {EcmaContext.Type}
     */
    this.type = contextType;
    /**
     * The token where this context starts.
     * @type {Token}
     */
    this.startToken = startToken;
    /**
     * The token where this context ends.
     * @type {Token}
     */
    this.endToken = null;
    /**
     * The parent context.
     * @type {EcmaContext}
     */
    this.parent = null;
    /**
     * The child contexts of this context, in order.
     * @type {Array.<EcmaContext>}
     */
    this.children = [];

    if (opt_parent) {
        opt_parent.addChild(this);
    }
};


/**
 * Returns a string representation of the context object.
 */
EcmaContext.prototype.toString = function() {
    var stack = [];
    var context = this;
    while (context) {
        stack.push(context.type);
        context = context.parent;
    }

    return _s.sprintf('Context(%s)', stack.join(' > '));
};


/**
 * Adds a child to this context and sets child's parent to this context.
 *
 * @param {EcmaContext} child A child EcmaContext. The child's parent will be
 * set to this context.
 */
EcmaContext.prototype.addChild = function(child) {
    child.parent = this;
    this.children.push(child);
    this.children = this.children.sort(EcmaContext._compareContext);
};


/**
 * Get the root context that contains this context, if any.
 * @return {?EcmaContext}
 */
EcmaContext.prototype.getRoot = function() {
    var context = this;
    while (context) {
        if (context.type == EcmaContext.Type.ROOT) {
            return context;
        }
        context = context.parent;
    }
};


/** Sorts contexts 1 and 2 by start token document position. */
EcmaContext._compareContext = function(a, b) {
    return tokenUtil.compare(a, b);
};


EcmaContext.Type = {
    // The root context.
    ROOT: 'root',

    // A block of code.
    BLOCK: 'block',

    // A pseudo-block of code for a given case or default section.
    CASE_BLOCK: 'case_block',

    // Block of statements in a for loop's parentheses.
    FOR_GROUP_BLOCK: 'for_block',

    // An implied block of code for 1 line if, while, and for statements
    IMPLIED_BLOCK: 'implied_block',

    // An index in to an array or object.
    INDEX: 'index',

    // An array literal in [].
    ARRAY_LITERAL: 'array_literal',

    // An object literal in {}.
    OBJECT_LITERAL: 'object_literal',

    // An individual element in an array or object literal.
    LITERAL_ELEMENT: 'literal_element',

    // The portion of a ternary statement between ? and :
    TERNARY_TRUE: 'ternary_true',

    // The portion of a ternary statment after :
    TERNARY_FALSE: 'ternary_false',

    // The entire switch statment.  This will contain a GROUP with the variable
    // and a BLOCK with the code.

    // Since that BLOCK is not a normal block, it can not contain statements
    // except for case and default.
    SWITCH: 'switch',

    // A normal comment.
    COMMENT: 'comment',

    // A JsDoc comment.
    DOC: 'doc',

    // An individual statement.
    STATEMENT: 'statement',

    // Code within parentheses.
    GROUP: 'group',

    // Parameter names in a function declaration.
    PARAMETERS: 'parameters',

    // A set of variable declarations appearing after the 'var' keyword.
    VAR: 'var'
};

// Context types that are blocks.
EcmaContext.Type.BLOCK_TYPES = [
    EcmaContext.Type.ROOT, EcmaContext.Type.BLOCK, EcmaContext.Type.CASE_BLOCK,
    EcmaContext.Type.FOR_GROUP_BLOCK, EcmaContext.Type.IMPLIED_BLOCK];


/**
 * Token metadata for EcmaScript languages.
 * @constructor
 */
var EcmaMetaData = function() {
    /**
     * The last code token to appear before this one.
     * @type {Token}
     */
    this.lastCode = null;
    /**
     * The context this token appears in.
     * @type {EcmaContext}
     */
    this.context = null;
    /**
     * The operator type, will be one of the *_OPERATOR constants defined below.
     * @type {string}
     */
    this.operatorType = null;
    this.isImpliedSemicolon = false;
    this.isImpliedBlock = false;
    this.isImpliedBlockClose = false;
    /**
     * The full symbol being identified, as a string (e.g. an 'XhrIo' alias for
     * 'goog.net.XhrIo'). Only applicable to identifier tokens. This is set in
     * aliaspass.js and is a best guess.
     * @type {null}
     */
    this.aliasedSymbol = null;
    /**
     * True if the symbol is part of an alias definition.
     * If so, these symbols won't be counted towards goog.requires/provides.
     * @type {boolean}
     */
    this.isAliasDefinition = false;
};


/** Returns a string representation of the context object. */
EcmaMetaData.prototype.toString = function() {
    var parts = [this.context];
    if (this.operatorType) {
        parts.push(_s.sprintf('optype: %s', this.operatorType));
    }
    if (this.isImpliedSemicolon) {
        part.push('implied;');
    }
    if (this.aliasedSymbol) {
        parts.push(_s.sprintf('alias for: %s', this.aliasedSymbol));
    }

    return _s.sprintf('MetaData(%s)', parts.join(', '));
};

EcmaMetaData.prototype.isUnaryOperator = function() {
    return this.operatorType == EcmaMetaData.UNARY_OPERATOR ||
            this.operatorType == EcmaMetaData.UNARY_POST_OPERATOR;
};

EcmaMetaData.prototype.isUnaryPostOperator = function() {
    return this.operatorType == EcmaMetaData.UNARY_POST_OPERATOR;
};

EcmaMetaData.UNARY_OPERATOR = 'unary';
EcmaMetaData.UNARY_POST_OPERATOR = 'unary_post';
EcmaMetaData.BINARY_OPERATOR = 'binary';
EcmaMetaData.TERNARY_OPERATOR = 'ternary';


/**
 * A pass that iterates over all tokens and builds metadata about them.
 * @constructor
 */
var EcmaMetaDataPass = function() {
    this.reset();
};


/**
 * Resets the metadata pass to prepare for the next file.
 */
EcmaMetaDataPass.prototype.reset = function() {
    this._token = null;
    this._context = null;
    this._addContext(EcmaContext.Type.ROOT);
    this._lastCode = null;
};


/**
 * Overridable by subclasses to create the appropriate context type.
 * @private
 */
EcmaMetaDataPass.prototype._createContext = function(contextType) {
    return new EcmaContext(contextType, this._token, this._context);
};


/**
 * Overridable by subclasses to create the appropriate metadata type.
 * @private
 */
EcmaMetaDataPass.prototype._createMetadata = function() {
    return new EcmaMetaData();
};


/**
 * Adds a context of the given type to the context stack.
 * @param {EcmaContext.Type} contextType The type of context to create.
 * @private
 */
EcmaMetaDataPass.prototype._addContext = function(contextType) {
    this._context = this._createContext(contextType);
};


/**
 * Moves up one level in the context stack.
 * @return {?EcmaContext} The former context.
 * @private
 */
EcmaMetaDataPass.prototype._popContext = function() {
    var topContext = this._context;
    topContext.endToken = this._token;
    this._context = topContext.parent;

    if (this._context) {
        return topContext;
    } else {
        throw new ParseError(this._token);
    }
};


/**
 * Pops the context stack until a context of the given type is popped.
 * @param {Array.<EcmaContext.Type} stopTypes The types of context to pop to
 *      stops at the first match.
 * @return {EcmaContext} The context object of the given type that was popped.
 * @private
 */
EcmaMetaDataPass.prototype._popContextType = function(stopTypes) {
    var last = null;
    while (!last || !_.contains(stopTypes, last.type)) {
        last = this._popContext();
    }
    return last;
};


/**
 * Process the end of a statement.
 * @private
 */
EcmaMetaDataPass.prototype._endStatement = function() {
    this._popContextType([EcmaContext.Type.STATEMENT]);
    if (this._context.type == EcmaContext.Type.IMPLIED_BLOCK) {
        this._token.metadata.isImpliedBlockClose = true;
        this._popContext();
    }
};


/**
 * Process the context at the current token.
 * @return {EcmaContext} The context that should be assigned to the current
 *      token, or null if the current context after this method should be used.
 * @private
 */
EcmaMetaDataPass.prototype._processContext = function() {
    var token = this._token;
    var tokenType = token.type;

    if (_.contains(EcmaContext.Type.BLOCK_TYPES, this._context.type)) {
        // Whenever we're in a block, we add a statement context.  We make an
        // exception for switch statements since they can only contain case: and
        // default: and therefore don't directly contain statements.
        // The block we add here may be immediately removed in some cases, but
        // that causes no harm.
        var parent = this._context.parent;
        if (!parent || parent.type != EcmaContext.Type.SWITCH) {
            this._addContext(EcmaContext.Type.STATEMENT);
        }
    } else if (this._context.type == EcmaContext.Type.ARRAY_LITERAL) {
        this._addContext(EcmaContext.Type.LITERAL_ELEMENT);
    }

    if (tokenType == TokenType.START_PAREN) {
        if (this._lastCode && this._lastCode.isKeyword('for')) {
            // For loops contain multiple statements in the group unlike while,
            // switch, if, etc.
            this._addContext(EcmaContext.Type.FOR_GROUP_BLOCK);
        } else {
            this._addContext(EcmaContext.Type.GROUP);
        }
    } else if (tokenType == TokenType.END_PAREN) {
        var result = this._popContextType([EcmaContext.Type.GROUP,
                EcmaContext.Type.FOR_GROUP_BLOCK]);
        var keyworkToken = result.startToken.metadata.lastCode;
        // keywordToken will not exist if the open paren is the first line of
        // the file, for example if all code is wrapped in an immediately
        // executed annonymous function.
        if (keyworkToken &&
                _.contains(['if', 'for', 'while'], keyworkToken.string)) {
            var nextCode = tokenUtil.searchExcept(token,
                    TokenType.NON_CODE_TYPES);
            if (nextCode.type != TokenType.START_BLOCK) {
                // Check for do-while.
                var isDoWhile = false;
                var preKeywordToken = keyworkToken.metadata.lastCode;
                if (preKeywordToken &&
                        preKeywordToken.type == TokenType.END_BLOCK) {
                    isDoWhile = preKeywordToken.metadata.context.startToken.
                            metadata.lastCode.string == 'do';
                }

                if (!isDoWhile) {
                    this._addContext(EcmaContext.Type.IMPLIED_BLOCK);
                    token.metadata.isImpliedBlock = true;
                }
            }
        }

        return result;
    // else (not else if) with no open brace after it should be considered
    // the start of an implied block, similar to the case with if, for, and
    // while above.
    } else if (tokenType == TokenType.KEYWORD && token.string == 'else') {
        var nextCode = tokenUtil.searchExcept(token,
                TokenType.NON_CODE_TYPES);
        if (nextCode.type != TokenType.START_BLOCK &&
                (nextCode.type != TokenType.KEYWORD ||
                        nextCode.string != 'if')) {
            this._addContext(EcmaContext.Type.IMPLIED_BLOCK);
            token.metadata.isImpliedBlock = true;
        }
    } else if (tokenType == TokenType.START_PARAMETERS) {
        this._addContext(EcmaContext.Type.PARAMETERS);
    } else if (tokenType == TokenType.END_PARAMETERS) {
        return this._popContextType([EcmaContext.Type.PARAMETERS]);
    } else if (tokenType == TokenType.START_BRACKET) {
        if (this._lastCode && _.contains(TokenType.EXPRESSION_ENDER_TYPES,
                this._lastCode.type)) {
            this._addContext(EcmaContext.Type.INDEX);
        } else {
            this._addContext(EcmaContext.Type.ARRAY_LITERAL);
        }
    } else if (tokenType == TokenType.END_BRACKET) {
        return this._popContextType(
                [EcmaContext.Type.INDEX, EcmaContext.Type.ARRAY_LITERAL]);
    } else if (tokenType == TokenType.START_BLOCK) {
        if (_.contains([TokenType.END_PAREN, TokenType.END_PARAMETERS],
                this._lastCode.type) ||
                this._lastCode.isKeyword('else') ||
                this._lastCode.isKeyword('do') ||
                this._lastCode.isKeyword('try') ||
                this._lastCode.isKeyword('finally') ||
                (this._lastCode.isOperator(':') &&
                        this._lastCode.metadata.context.type ==
                                EcmaContext.Type.CASE_BLOCK)) {
            // else, do, try, and finally all might have no () before {.
            // Also, handle the bizzare syntax case 10: {...}.
            this._addContext(EcmaContext.Type.BLOCK);
        } else {
            this._addContext(EcmaContext.Type.OBJECT_LITERAL);
        }
    } else if (tokenType == TokenType.END_BLOCK) {
        var context = this._popContextType(
                [EcmaContext.Type.BLOCK, EcmaContext.Type.OBJECT_LITERAL]);
        if (this._context.type == EcmaContext.Type.SWITCH) {
            return this._popContext();
        }
        return context;
    } else if (token.isKeyword('switch')) {
        this._addContext(EcmaContext.Type.SWITCH);
    } else if (tokenType == TokenType.KEYWORD &&
            _.contains(['case', 'default'], token.string) &&
            this._context.type != EcmaContext.Type.OBJECT_LITERAL) {
        // Pop up to but not including the switch block.
        while (this._context.parent.type != EcmaContext.Type.SWITCH) {
            this._popContext();
            if (this._context.parent == null) {
                throw new ParseError(token, 'Encountered case/default ' +
                        'statement without switch statement');
            }
        }
    } else if (token.isOperator('?')) {
        this._addContext(EcmaContext.Type.TERNARY_TRUE);
    } else if (token.isOperator(':')) {
        if (this._context.type == EcmaContext.Type.OBJECT_LITERAL) {
            this._addContext(EcmaContext.Type.LITERAL_ELEMENT);
        } else if (this._context.type == EcmaContext.Type.TERNARY_TRUE) {
            this._popContext();
            this._addContext(EcmaContext.Type.TERNARY_FALSE);
        // Handle nested ternary statements like:
        // foo = bar ? baz ? 1 : 2 : 3
        // When we encounter the second ":" the context is
        // ternary_false > ternary_true > statement > root
        } else if (this._context.type == EcmaContext.Type.TERNARY_FALSE &&
                this._context.parent.type == EcmaContext.Type.TERNARY_TRUE) {
            this._popContext(); // Leave current ternary false context.
            this._popContext(); // Leave current parent ternary true.
            this._addContext(EcmaContext.Type.TERNARY_FALSE);
        } else if (this._context.parent.type == EcmaContext.Type.SWITCH) {
            this._addContext(EcmaContext.Type.CASE_BLOCK);
        }
    } else if (token.isKeyword('var')) {
        this._addContext(EcmaContext.Type.VAR);
    } else if (token.isOperator(',')) {
        while (!_.contains([EcmaContext.Type.VAR,
            EcmaContext.Type.ARRAY_LITERAL, EcmaContext.Type.OBJECT_LITERAL,
            EcmaContext.Type.STATEMENT, EcmaContext.Type.PARAMETERS,
            EcmaContext.Type.GROUP], this._context.type)) {

            this._popContext();
        }
    } else if (tokenType == TokenType.SEMICOLON) {
        this._endStatement();

    }
};


/**
 * Processes the token stream starting with the given token.
 * @param {Token} firstToken
 */
EcmaMetaDataPass.prototype.process = function(firstToken) {
    this._token = firstToken;
    while (this._token) {
        this._processToken();

        if (this._token.isCode()) {
            this._lastCode = this._token;
        }

        this._token = this._token.next;
    }

    try {
        this._popContextType([EcmaContext.Type.ROOT]);
    } catch (e) {
        if (e instanceof ParseError) {
            // Ignore the "popped to root" error.
        } else {
            throw e;
        }
    }
};


/**
 * Process the given token.
 * @private
 */
EcmaMetaDataPass.prototype._processToken = function() {
    var token = this._token;
    token.metadata = this._createMetadata();
    var context = this._processContext() || this._context;
    token.metadata.context = context;
    token.metadata.lastCode = this._lastCode;

    // Determine the operator type of the token, if applicable.
    if (token.type == TokenType.OPERATOR) {
        token.metadata.operatorType = this._getOperatorType(token);
    }

    // Determine if there is an implied semicolon after the token.
    if (token.type != TokenType.SEMICOLON) {
        var nextCode = tokenUtil.searchExcept(token,
                TokenType.NON_CODE_TYPES);
        // A statement like if (x) does not need a semicolon after it.
        var isImpiedBlock = this._context == EcmaContext.Type.IMPLIED_BLOCK;
        var isLastCodeInLine = token.isCode() &&
                (!nextCode || nextCode.lineNumber != token.lineNumber);
        var isContinuedIdentifier = token.type == TokenType.IDENTIFIER &&
                _s.endsWith(token.string, '.');
        var isContinuedOperator = token.type == TokenType.OPERATOR &&
                !token.metadata.isUnaryPostOperator();
        var isContinuedDot = token.string == '.';
        var nextCodeIsOperator = nextCode &&
                nextCode.type == TokenType.OPERATOR;
        var nextCodeIsDot = nextCode && nextCode.string == '.';
        var isEndOfBlock = token.type == TokenType.END_BLOCK &&
                token.metadata.context.type != EcmaContext.Type.OBJECT_LITERAL;
        var isMultilineString = token.type == TokenType.STRING_TEXT;
        var isContinuedVarDecl = token.isKeyword('var') &&
                nextCode &&
                _.contains([TokenType.IDENTIFIER, TokenType.SIMPLE_LVALUE],
                        nextCode.type) &&
                token.lineNumber < nextCode.lineNumber;
        var nextCodeIsBlock = nextCode &&
                nextCode.type == TokenType.START_BLOCK;

        if (isLastCodeInLine && this._statementCouldEndInContext() &&
                !isMultilineString && !isEndOfBlock && !isContinuedVarDecl &&
                !isContinuedIdentifier && !isContinuedOperator &&
                !isContinuedDot && !nextCodeIsDot && !nextCodeIsOperator &&
                !isImpiedBlock && !nextCodeIsBlock) {
            token.metadata.isImpliedSemicolon = true;
            this._endStatement();
        }
    }
};


/**
 * Returns if the current statement (if any) may end in this context.
 * @private
 */
EcmaMetaDataPass.prototype._statementCouldEndInContext = function() {
    // In the basic statement or variable declaration context, statement can
    // always end in this context.
    if (_.contains([EcmaContext.Type.STATEMENT, EcmaContext.Type.VAR],
            this._context.type)) {
        return true;
    }

    // End of a ternary false branch inside a statement can also be the
    // end of the statement, for example:
    // var x = foo ? foo.bar() : null
    // In this case the statement ends after the null, when the context stack
    // looks like ternary_false > var > statement > root.
    if (this._context.type == EcmaContext.Type.TERNARY_FALSE &&
            _.contains([EcmaContext.Type.STATEMENT, EcmaContext.Type.VAR],
                    this._context.parent.type)) {
        return true;
    }

    // In all other contexts like object and array literals, ternary true, etc.
    // the statement can't yet end.
    return false;
};


/**
 * Returns the operator type of the given operator token.
 * @param {Token} token The token to get arity for.
 * @return {string} The type of the operator. One of the *_OPERATOR constants
 *      defined in EcmaMetaData.
 * @private
 */
EcmaMetaDataPass.prototype._getOperatorType = function(token) {
    if (token.string == '?') {
        return EcmaMetaData.TERNARY_OPERATOR;
    }
    if (_.contains(TokenType.UNARY_OPERATORS, token.string)) {
        return EcmaMetaData.UNARY_OPERATOR;
    }

    var lastCode = token.metadata.lastCode;
    if (!lastCode || lastCode.type == TokenType.END_BLOCK) {
        return EcmaMetaData.UNARY_OPERATOR;
    }

    if (_.contains(TokenType.UNARY_POST_OPERATORS, token.string) &&
            _.contains(TokenType.EXPRESSION_ENDER_TYPES, lastCode.type)) {
        return EcmaMetaData.UNARY_POST_OPERATOR;
    }

    if (_.contains(TokenType.UNARY_OK_OPERATORS, token.string) &&
            !_.contains(TokenType.EXPRESSION_ENDER_TYPES, lastCode.type) &&
            !_.contains(TokenType.UNARY_POST_OPERATORS, lastCode.string)) {
        return EcmaMetaData.UNARY_OPERATOR;
    }

    return EcmaMetaData.BINARY_OPERATOR;
};


exports.EcmaContext = EcmaContext;
exports.EcmaMetaDataPass = EcmaMetaDataPass;
exports.ParseError = ParseError;
