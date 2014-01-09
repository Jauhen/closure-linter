/**
 * Pass that scans for goog.scope aliases and lint/usage errors.
 */

var _ = require('underscore');
var ecmaMetadataPass = require('./ecmametadatapass');
var error = require('../common/error');
var errors = require('./errors');
var scopeUtil = require('./scopeutil');
var javascriptTokens = require('./javascripttokens');
var tokenUtil = require('./tokenutil');

var EcmaContext = ecmaMetadataPass.EcmaContext;
var Type = javascriptTokens.JavaScriptTokenType;


/**
 * Returns the aliased_symbol name for an identifier.
 *
 * Example usage:
 * >>> alias_map = {'MyClass': 'goog.foo.MyClass'}
 * >>> getAliasForIdentifier('MyClass.prototype.action', alias_map)
 * 'goog.foo.MyClass.prototype.action'
 *
 * >>> getAliasForIdentifier('MyClass.prototype.action', {})
 * null
 * @param {string} identifier The identifier.
 * @param {{string: string}} aliasMap A dictionary mapping a symbol to an alias.
 * @return {?string} The aliased symbol name or null if not found.
 */
var getAliasForIdentifier = function(identifier, aliasMap) {
    var ns = identifier.split('.', 1)[0];
    var aliasedSymbol = aliasMap[ns];
    if (aliasedSymbol) {
        return aliasedSymbol + identifier.substr(ns.length);
    }
    return null;
};

/**
 * Pass to identify goog.scope() usages.
 *
 * Identifies goog.scope() usages and finds lint/usage errors.  Notes any
 * aliases of symbols in Closurized namespaces (that is, reassignments
 * such as "var MyClass = goog.foo.MyClass;") and annotates identifiers
 * when they're using an alias (so they may be expanded to the full symbol
 * later -- that "MyClass.prototype.action" refers to
 * "goog.foo.MyClass.prototype.action" when expanded.).
 * @param {Array.<string>} closurizedNamespaces A set of closurized
 *      namespaces (e.g. 'goog').
 * @param {ErrorHandler} errorHandler An error handler to report lint errors to.
 * @constructor
 */
var AliasPass = function(closurizedNamespaces, errorHandler) {
    this._errorHandler = errorHandler;

    // If we have namespaces, freeze the set.
    this._closurizedNamespaces = closurizedNamespaces;
};


/**
 * Runs the pass on a token stream.
 * @param {Token} startToken The first token in the stream.
 */
AliasPass.prototype.process = function(startToken) {
    // TODO(nnaze): Add more goog.scope usage checks.
    this._checkGoogScopeCalls(startToken);

    // If we have closurized namespaces, identify aliased identifiers.
    if (this._closurizedNamespaces) {
        var context = startToken.metadata.context;
        var rootContext = context.getRoot();
        this._processRootContext(rootContext);
    }
};


/**
 * Check goog.scope calls for lint/usage errors.
 * @param {Token} startToken
 * @private
 */
AliasPass.prototype._checkGoogScopeCalls = function(startToken) {
    var isScopeToken = function(token) {
        return token.type == Type.IDENTIFIER && token.string == 'goog.scope';
    };

    // Find all the goog.scope tokens in the file.
    var scopeTokens = _.filter(startToken.directIterator(), isScopeToken);

    _.each(scopeTokens, function(token) {
        var scopeContext = token.metadata.context;

        if (!(scopeContext.type == EcmaContext.Type.STATEMENT &&
                scopeContext.parent.type == EcmaContext.Type.ROOT)) {
            this._maybeReportError(new error.Error(
                    errors.Errors.INVALID_USE_OF_GOOG_SCOPE,
                    'goog.scope call not in global scope', token));
        }
    }, this);

    // There should be only one goog.scope reference.  Register errors for
    // every instance after the first.
    _.each(scopeTokens.splice(1), function(token) {
        this._maybeReportError(new error.Error(
                errors.Errors.EXTRA_GOOG_SCOPE_USAGE,
                'More than one goog.scope call in file.', token));
    }, this);
};


/**
 * Report an error to the handler (if registered).
 * @param {error.Error} err
 * @private
 */
AliasPass.prototype._maybeReportError = function(err) {
    if (this._errorHandler) {
        this._errorHandler.handleError(err);
    }
};


/**
 * Processes all goog.scope blocks under the root context.
 * @param {EcmaContext.Type} rootContext
 * @private
 */
AliasPass.prototype._processRootContext = function(rootContext) {
     if (rootContext.type != EcmaContext.Type.ROOT) {
         console.log('rootContext != EcmaContext.Type.ROOT');
     }

    // Identify all goog.scope blocks.
    var googScopeBlocks = [];
    AliasPass._yeildAllContexts(googScopeBlocks, rootContext);
    googScopeBlocks = _.filter(googScopeBlocks, scopeUtil.isGoogScopeBlock);

    // Process each block to find aliases.
    _.each(googScopeBlocks, function(scopeBlock) {
        this._processGoogScopeBlock(scopeBlock);
    }, this);
};


/**
 * Scans a goog.scope block to find aliases and mark alias tokens.
 * @param {Context} scopeBlock
 * @private
 */
AliasPass.prototype._processGoogScopeBlock = function(scopeBlock) {
    var aliasMap = {};

    // Iterate over every token in the scope_block. Each token points to one
    // context, but multiple tokens may point to the same context. We only want
    // to check each context once, so keep track of those we've seen.
    var seenContext = [];
    var token = scopeBlock.startToken;
    while (token && AliasPass._isTokenInParentBlock(token, scopeBlock)) {
        var tokenContext = token.metadata.context;

        // Check to see if this token is an alias.
        if (!_.contains(seenContext, tokenContext)) {
            seenContext.push(tokenContext);

            // If this is a alias statement in the goog.scope block.
            if (tokenContext.type == EcmaContext.Type.VAR &&
                    tokenContext.parent.parent == scopeBlock) {
                var match = scopeUtil.matchAlias(tokenContext.parent);

                // If this is an alias, remember it in the map.
                if (match) {
                    if (scopeUtil.isInClosurizedNamespace(match.symbol,
                            this._closurizedNamespaces)) {
                        aliasMap[match.alias] = match.symbol;
                    }
                }
            }
        }

        // If this token is an identifier that matches an alias,
        // mark the token as an alias to the original symbol.
        if (token.type == Type.SIMPLE_LVALUE || token.type == Type.IDENTIFIER) {
            var identifier = tokenUtil.getIdentifierForToken(token);
            if (identifier) {
                var aliasedSymbol = getAliasForIdentifier(identifier, aliasMap);
                if (aliasedSymbol) {
                    token.metadata.aliasedSymbol = aliasedSymbol;
                }
            }
        }

        token = token.next; // Get next token.
    }
};


/**
 * Yields all contexts that are contained by the given context.
 * @param {Array.<EcmaContext>} collector
 * @param {EcmaContext} context
 * @private
 */
AliasPass._yeildAllContexts = function(collector, context) {
    collector.push(context);
    _.each(context.children, function(childContext) {
        AliasPass._yeildAllContexts(collector, childContext);
    });
};


/**
 * Determines whether the given token is contained by the given block.
 * @param {Token} token
 * @param {EcmaContext} parentBlock
 * @returns {boolean} Whether the token is in a context that is or is a child
 *      of the given parent_block context.
 * @private
 */
AliasPass._isTokenInParentBlock = function(token, parentBlock) {
    var context = token.metadata.context;

    while (context) {
        if (context == parentBlock) {
            return true;
        }
        context = context.parent;
    }

    return false;
};


exports.AliasPass = AliasPass;
