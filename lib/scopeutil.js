
var _ = require('underscore');
var _s = require('underscore.string');
var ecmaMetadataPass = require('./ecmametadatapass');
var tokenUtil = require('./tokenutil');
var javascriptTokens = require('./javascripttokens');

var EcmaContext = ecmaMetadataPass.EcmaContext;
var Type = javascriptTokens.JavaScriptTokenType;


/**
 * Whether the given context is a goog.scope block.
 *
 * This function only checks that the block is a function block inside
 * a goog.scope() call.
 *
 * TODO(nnaze): Implement goog.scope checks that verify the call is
 * in the root context and contains only a single function literal.
 *
 * @param {EcmaContext} context An EcmaContext of type block.
 * @returns {boolean} Whether the context is a goog.scope block.
 */
var isGoogScopeBlock = function(context) {
    if (context.type != EcmaContext.Type.BLOCK) {
        return false;
    }

    if (!isFunctionLiteralBlock(context)) {
        return false;
    }

    // Check that this function is contained by a group
    // of form "goog.scope(...)".
    var parent = context.parent;
    if (parent && parent.type == EcmaContext.Type.GROUP) {
        var lastCodeToken = parent.startToken.metadata.lastCode;

        if (lastCodeToken && lastCodeToken.type == Type.IDENTIFIER &&
                lastCodeToken.string == 'goog.scope') {
            return true;
        }
    }

    return false;
};


/**
 * Check if a context is a function literal block (without parameters).
 *
 * Example function literal block: 'function() {}'
 * @param {EcmaContext} blockContext An EcmaContext of type block.
 * @returns {boolean} Whether this context is a function literal block.
 */
var isFunctionLiteralBlock = function(blockContext) {
    var previousCodeTokenIter = _.filter(
            blockContext.startToken.reverseIterator(),
            function(token) {
                return !_.contains(Type.NON_CODE_TYPES, token.type)});

    // Ignore the current token.
    // Grab the previous three tokens and put them in correct order.
    var previousCodeTokens = previousCodeTokenIter.slice(1, 4);
    previousCodeTokens.reverse();

    // There aren't three previous tokens.
    if (previousCodeTokens.length != 3) {
        return false;
    }

    // Check that the previous three code tokens are "function ()".
    var previousCodeTokenTypes = _.pluck(previousCodeTokens, 'type');
    if (previousCodeTokenTypes[0] == Type.FUNCTION_DECLARATION &&
            previousCodeTokenTypes[1] == Type.START_PARAMETERS &&
            previousCodeTokenTypes[2] == Type.END_PARAMETERS) {
        return true;
    }

    return false;
};


/**
 * Match a goog.scope alias.
 * @param {string} symbol An identifier like 'goog.events.Event'.
 * @param {Array.<string>} closurizedNamespaces Iterable of valid Closurized
 *      namespaces (strings).
 * @returns {boolean} True if symbol is an identifier in a Closurized namespace,
 *      otherwise False.
 */
var isInClosurizedNamespace = function(symbol, closurizedNamespaces) {
    return _.some(closurizedNamespaces, function(ns) {
        return _s.startsWith(symbol, ns + '.');
    });
};


/**
 * Match an alias statement (some identifier assigned to a variable).
 *
 * Example alias: var MyClass = proj.longNamespace.MyClass.
 * @param {EcmaContext} context An EcmaContext of type EcmaContext.STATEMENT.
 * @returns {?{alias: string, symbol: string}} If a valid alias, returns a tuple
 *      of alias and symbol, otherwise null.
 */
var matchAlias = function(context) {
    if (context.type != EcmaContext.Type.STATEMENT) {
        return null;
    }

    // Get the tokens in this statement.
    if (context.startToken && context.endToken) {
        var statementTokens = tokenUtil.getTokenRange(context.startToken,
                context.endToken);
    } else {
        return null;
    }

    //And now just those tokens that are actually code.
    var isNonCodeType = function(t) {
        return !_.contains(Type.NON_CODE_TYPES, t.type);
    };

    var codeTokens = _.filter(statementTokens, isNonCodeType);

    // This section identifies statements of the alias form
    // "var alias = symbol".

    //Pop off the semicolon if present.
    if (codeTokens && _.last(codeTokens).isType(Type.SEMICOLON)) {
        codeTokens.pop();
    }

    if (!(codeTokens.length == 4 && codeTokens[0].isKeyword('var') &&
            (codeTokens[0].metadata.context.type == EcmaContext.Type.VAR))) {
        return
    }

    // Verify the only code tokens in this statement are part of the var
    // declaration.
    var varContext = codeTokens[0].metadata.context;
    for (var i = 0; i < codeTokens.length; i++) {
        if (codeTokens[i].metadata.context != varContext) {
            return null;
        }
    }

    // Verify that this is of the form "var lvalue = identifier;".
    if (!(codeTokens[0].isKeyword('var') &&
            codeTokens[1].isType(Type.SIMPLE_LVALUE) &&
            codeTokens[2].isOperator('=') &&
            codeTokens[3].isType(Type.IDENTIFIER))) {
        return null;
    }

    var alias = codeTokens[1];
    var symbol = codeTokens[3];
    // Mark both tokens as an alias definition to avoid counting them as usages.
    alias.metadata.isAliasDefinition = true;
    symbol.metadata.isAliasDefinition = true;

    return {alias: alias.string, symbol: symbol.string};
};


exports.isGoogScopeBlock = isGoogScopeBlock;
exports.isInClosurizedNamespace = isInClosurizedNamespace;
exports.matchAlias = matchAlias;
