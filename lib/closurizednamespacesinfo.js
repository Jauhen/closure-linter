/**
 * Logic for computing dependency information for closurized JavaScript files.
 *
 * Closurized JavaScript files express dependencies using goog.require and
 * goog.provide statements. In order for the linter to detect when a statement
 * is missing or unnecessary, all identifiers in the JavaScript file must first
 * be processed to determine if they constitute the creation or usage of
 * a dependency.
 */

var _ = require('underscore');
var _s = require('underscore.string');
var javascriptTokens = require('./javascripttokens');
var tokenUtil = require('./tokenutil');

var Type = javascriptTokens.JavaScriptTokenType;

var DEFAULT_EXTRA_NAMESPACES = ['goog.testing.asserts', 'goog.testing.jsunit'];


/**
 * Dependency information for closurized JavaScript files.
 *
 * Processes token streams for dependency creation or usage and provides logic
 * for determining if a given require or provide statement is unnecessary or
 * if there are missing require or provide statements.
 * @param {Array.<string>} closurizedNamespaces A list of namespace prefixes
 *      that should be processed for dependency information. Non-matching
 *      namespaces are ignored.
 * @param {Array.<string>} ignoredExtraNamespaces A list of namespaces that
 *      should not be reported as extra regardless of whether they are actually
 *      used.
 * @constructor
 */
var ClosurizedNamespacesInfo = function(closurizedNamespaces,
                                        ignoredExtraNamespaces) {
    this._closurizedNamespaces = closurizedNamespaces;
    this._ignoredExtraNamespaces = _.union(ignoredExtraNamespaces,
            DEFAULT_EXTRA_NAMESPACES);
    this.reset();
};


/**
 * Resets the internal state to prepare for processing a new file.
 */
ClosurizedNamespacesInfo.prototype.reset = function() {
    // A list of goog.provide tokens in the order they appeared in the file.
    this._provideTokens = [];

    // A list of goog.require tokens in the order they appeared in the file.
    this._requireTokens = [];

    // Namespaces that are already goog.provided.
    this._providedNamespaces = [];

    // Namespaces that are already goog.required.
    this._requiredNamespaces = [];

    // Note that created_namespaces and used_namespaces contain both namespaces
    // and identifiers because there are many existing cases where a method or
    // constant is provided directly instead of its namespace. Ideally, these
    // two lists would only have to contain namespaces.

    // A list of tuples where the first element is the namespace of an
    // identifier created in the file, the second is the identifier itself and
    // the third is the line number where it's created.
    this._createdNamespaces = [];

    // A list of tuples where the first element is the namespace of an
    // identifier used in the file, the second is the identifier itself and
    // the third is the line number where it's used.
    this._usedNamespaces = [];

    // A list of seemingly-unnecessary namespaces that are goog.required() and
    // annotated with @suppress {extraRequire}.
    this._suppressedRequires = [];

    // A list of goog.provide tokens which are duplicates.
    this._duplicateProvideTokens = [];

    // A list of goog.require tokens which are duplicates.
    this._duplicateRequireTokens = [];

    // Whether this file is in a goog.scope. Someday, we may add support for
    // checking scopified namespaces, but for now let's just fail in a more
    // reasonable way.
    this._scopifiedFile = false;

    // TODO(user): Handle the case where there are 2 different requires that can
    // satisfy the same dependency, but only one is necessary.
};


/**
 * Returns the namespaces which are already provided by this file.
 * @return {Array.<string>} A list of strings where each string is a
 *      'namespace' corresponding to an existing goog.provide statement in
 *      the file being checked.
 */
ClosurizedNamespacesInfo.prototype.getProvidedNamespaces = function() {
    return _.uniq(this._providedNamespaces);
};


/**
 * Returns the namespaces which are already required by this file.
 * @return {Array.<string>} A list of strings where each string is a
 *      'namespace' corresponding to an existing goog.require statement in
 *      the file being checked.
 */
ClosurizedNamespacesInfo.prototype.getRequiredNamespaces = function() {
    return _.uniq(this._requiredNamespaces);
};


/**
 * Returns whether the given goog.provide token is unnecessary.
 * @param {Token} token A goog.provide token.
 * @return {boolean} True if the given token corresponds to an unnecessary
 *      goog.provide statement, otherwise False.
 */
ClosurizedNamespacesInfo.prototype.isExtraProvide = function(token) {
    var namespace = tokenUtil.getStringAfterToken(token);
    var baseNamespace = namespace.split('.', 1)[0];
    if (!_.contains(this._closurizedNamespaces, baseNamespace)) {
        return false;
    }

    if (_.contains(this._duplicateProvideTokens, token)) {
        return true;
    }

    // TODO(user): There's probably a faster way to compute this.
    return !_.some(this._createdNamespaces, function(ns) {
        return namespace == ns.createdNamespace ||
                namespace == ns.createdIdentifier;
    });
};


/**
 * Returns whether the given goog.require token is unnecessary.
 * @param {Token} token A goog.require token.
 * @returns {boolean} True if the given token corresponds to an unnecessary
 *      goog.require statement, otherwise False.
 */
ClosurizedNamespacesInfo.prototype.isExtraRequire = function(token) {
    var namespace = tokenUtil.getStringAfterToken(token);
    var baseNamespace = namespace.split('.', 1)[0];
    if (!_.contains(this._closurizedNamespaces, baseNamespace)) {
        return false;
    }

    if (_.contains(this._ignoredExtraNamespaces, namespace)) {
        return false;
    }

    if (_.contains(this._duplicateRequireTokens, token)) {
        return true;
    }

    if (_.contains(this._suppressedRequires, namespace)) {
        return false;
    }

    // If the namespace contains a component that is initial caps, then that
    // must be the last component of the namespace.
    var parts = namespace.split('.');
    if (parts.length > 1 && _.last(parts) == _.last(parts).toUpperCase()) {
        return true;
    }

    // TODO(user): There's probably a faster way to compute this.
    return !_.some(this._createdNamespaces, function(ns) {
        return namespace == ns.createdNamespace ||
                namespace == ns.createdIdentifier;
    });
};


/**
 * Returns the dict of missing provided namespaces for the current file.
 * @return {Object.<string: string>} Returns a dictionary of key as string and
 *      value as integer where each string(key) is a namespace that should be
 *      provided by this file, but is not and integer(value) is first line
 *      number where it's defined.
 */
ClosurizedNamespacesInfo.prototype.getMissingProvides = function() {
    var missingProvides = {};

    _.each(this._createdNamespaces, function(ns) {
        if (!this._isPrivateIdentifier(ns.identifier) &&
                !_.contains(this._providedNamespaces, ns.namespace) &&
                !_.contains(this._providedNamespaces, ns.identifier) &&
                !_.contains(this._requiredNamespaces, ns.namespace) &&
                !_.contains(_.keys(missingProvides), ns.namespace)) {
            missingProvides[ns.namespace] = ns.lineNumber;
        }
    }, this);

    return missingProvides;
};


/**
 * Returns the dict of missing required namespaces for the current file.
 *
 * For each non-private identifier used in the file, find either a
 * goog.require, goog.provide or a created identifier that satisfies it.
 * goog.require statements can satisfy the identifier by requiring either the
 * namespace of the identifier or the identifier itself. goog.provide
 * statements can satisfy the identifier by providing the namespace of the
 * identifier. A created identifier can only satisfy the used identifier if
 * it matches it exactly (necessary since things can be defined on a
 * namespace in more than one file). Note that provided namespaces should be
 * a subset of created namespaces, but we check both because in some cases we
 * can't always detect the creation of the namespace.
 *
 *  @return {Object.<string: string>} Returns a dictionary of key as string
 *          and value integer where each string(key) is a namespace that
 *          should be required by this file, but is not and integer(value)
 *          is first line number where it's used.
 */
ClosurizedNamespacesInfo.prototype.getMissingRequires = function() {
    var externalDependencies = _.uniq(this._requiredNamespaces);

    // Assume goog namespace is always available.
    externalDependencies.push('goog');

    var createdIdentifier = [];
    _.each(this._createdNamespaces, function(ns) {
        createdIdentifier.push(ns.identifier);
    });

    var missingRequires = {};
    _.each(this._usedNamespaces, function(ns) {
        if (!this._isPrivateIdentifier(ns.identifier) &&
                !_.contains(externalDependencies, ns.namespace) &&
                !_.contains(this._providedNamespaces, ns.namespace) &&
                !_.contains(externalDependencies, ns.identifier) &&
                !_.contains(createdIdentifier, ns.identifier) &&
                !_.contains(_.keys(missingRequires), ns.namespace)) {
            missingRequires[ns.namespace] = ns.lineNumber;
        }
    }, this);

    return missingRequires;
};


/**
 * Returns whether the given identifer is private.
 * @param {string} identifier
 * @return {boolean}
 * @private
 */
ClosurizedNamespacesInfo.prototype._isPrivateIdentifier = function(identifier) {
    var pieces = identifier.split('.');
    return _.some(pieces, function(piece) {
        return _s.endsWith(piece, '_');
    });
};


/**
 * Returns whether token is the first provide token.
 * @param {Token} token
 * @return {boolean}
 */
ClosurizedNamespacesInfo.prototype.isFirstProvide = function(token) {
    return !!this._provideTokens && token == _.first(this._provideTokens);
};


/**
 * Returns whether token is the first require token.
 * @param {Token} token
 * @return {boolean}
 */
ClosurizedNamespacesInfo.prototype.isFirstRequire = function(token) {
    return !!this._requireTokens && token == _.first(this._requireTokens);
};


/**
 * Returns whether token is the last provide token.
 * @param {Token} token
 * @return {boolean}
 */
ClosurizedNamespacesInfo.prototype.isLastProvide = function(token) {
    return !!this._provideTokens && token == _.last(this._provideTokens);
};


/**
 * Returns whether token is the last require token.
 * @param token
 * @return {boolean}
 */
ClosurizedNamespacesInfo.prototype.isLastRequire = function(token) {
   return !!this._requireTokens && token == _.last(this._requireTokens);
};


/**
 * Processes the given token for dependency information.
 * @param {Token} token The token to process.
 * @param {StateTracker} state The JavaScript state tracker.
 */
ClosurizedNamespacesInfo.prototype.processToken = function(token,  state) {
    // Note that this method is in the critical path for the linter and has
    // been optimized for performance in the following ways:
    // - Tokens are checked by type first to minimize the number of function
    //   calls necessary to determine if action needs to be taken for the token.
    // - The most common tokens types are checked for first.
    // - The number of function calls has been minimized (thus the length of
    //   this function.

    if (token.type == Type.IDENTIFIER) {
        // TODO(user): Consider saving the whole identifier in metadata.
        var wholeIdentifierStraing = tokenUtil.getIdentifierForToken(token);
        if (wholeIdentifierStraing == null) {
            // We only want to process the identifier one time. If the whole
            // string identifier is None, that means this token was part of
            // a multi-token identifier, but it was not the first token of
            // the identifier.
            return;
        }

        // In the odd case that a goog.require is encountered inside a function,
        // just ignore it (e.g. dynamic loading in test runners).
        if (token.string == 'goog.require' && !state.inFunction()) {
            this._requireTokens.push(token);
            var namespace = tokenUtil.getStringAfterToken(token);
            if (_.contains(this._requiredNamespaces, namespace)) {
                this._duplicateRequireTokens.push(token);
            } else {
                this._requiredNamespaces.push(namespace);
            }

            // If there is a suppression for the require, add a usage for it so
            // it gets treated as a regular goog.require (i.e. still gets
            // sorted).
            var jsdoc = state.getDocComment();
            if (jsdoc && _.contains(jsdoc.suppressions, 'extraRequire')) {
                this._suppressedRequires.push(namespace);
                this._addUsedNamespace(state, namespace, token.lineNumber);
            }

        } else if (token.string == 'goog.provide') {
            this._provideTokens.push(token);
            namespace = tokenUtil.getStringAfterToken(token);
            if (_.contains(this._providedNamespaces, namespace)) {
                this._duplicateProvideTokens.push(token);
            } else {
                this._providedNamespaces.push(namespace);
            }

            // If there is a suppression for the provide, add a creation for it
            // so it gets treated as a regular goog.provide (i.e. still gets
            // sorted).
            jsdoc = state.getDocComment();
            if (jsdoc && _.contains(jsdoc.suppressions, 'extraProvide')) {
                this._addCreatedNamespace(state, namespace, token.lineNumber);
            }

        } else if (token.string == 'goog.scope') {
            this._scopifiedFile = true;

        } else if (token.string == 'goog.setTestOnly') {
            // Since the message is optional, we don't want to scan to later
            // lines.
            _.some(tokenUtil.getAllTokensInSameLine(token), function(t) {
                if (t.type == Type.STRING_TEXT) {
                    var message = t.string;

                    if (/^\w+(\.\w+)+$/.test(message)) {
                        // This looks like a namespace. If it's a Closurized
                        // namespace, consider it created.
                        var baseNamespace = message.split('.', 1)[0];
                        if (_.contains(this._closurizedNamespaces,
                                baseNamespace)) {
                            this._addCreatedNamespace(state, message,
                                    token.lineNumber);
                        }
                        return true;
                    }
                }
                return false;
            }, this);

        } else {
            jsdoc = state.getDocComment();
            if (token.metadata && token.metadata.aliasedSymbol) {
                wholeIdentifierStraing = token.metadata.aliasedSymbol;
            }
            if (jsdoc && jsdoc.hasFlag('typedef')) {
                this._addCreatedNamespace(state, wholeIdentifierStraing,
                        token.lineNumber,
                        this.getClosurizedNamespace(wholeIdentifierStraing));
            } else {
                if (!(token.metadata && token.metadata.isAliasDefinition)) {
                    this._addUsedNamespace(state, wholeIdentifierStraing,
                            token.lineNumber);
                }
            }
        }

    } else if (token.type == Type.SIMPLE_LVALUE) {
        var identifier = token.values[1];
        var startToken = tokenUtil.getIdentifierStart(token);
        if (startToken && startToken != token) {
            // Multi-line identifier being assigned. Get the whole identifier.
            identifier = tokenUtil.getIdentifierForToken(startToken);
        } else {
            startToken = token;
        }
        // If an alias is defined on the start_token, use it instead.
        if (startToken && startToken.metadata &&
                startToken.metadata.aliasedSymbol &&
                !startToken.metadata.isAliasDefinition) {
            identifier = startToken.metadata.aliasedSymbol;
        }

        if (identifier) {
            namespace = this.getClosurizedNamespace(identifier);
            if (state.inFunction()) {
                this._addUsedNamespace(state, identifier, token.lineNumber);
            } else if (namespace && namespace != 'goog') {
                this._addCreatedNamespace(state, identifier, token.lineNumber,
                        namespace);
            }
        }

    } else if (token.type == Type.DOC_FLAG) {
        var flagType = token.attachedObject.flagType;
        var isInterface = state.getDocComment().hasFlag('interface');
        if (flagType == 'implements' || (flagType == 'extends' &&
                isInterface)) {
            // Interfaces should be goog.require'd.
            var docStart = tokenUtil.search(token, [Type.DOC_START_BRACE]);
            var jsInterface = tokenUtil.search(docStart, [Type.COMMENT]);
            this._addUsedNamespace(state, jsInterface.string, token.lineNumber);
        }
    }
};


/**
 * Adds the namespace of an identifier to the list of created namespaces.
 *
 * If the identifier is annotated with a 'missingProvide' suppression, it is
 * not added.
 * @param {StateTracker} state The JavaScriptStateTracker instance.
 * @param {string} identifier The identifier to add.
 * @param {number} lineNumber Line number where namespace is created.
 * @param {?string} opt_namespace The namespace of the identifier or None if
 *      the identifier is also the namespace.
 * @private
 */
ClosurizedNamespacesInfo.prototype._addCreatedNamespace = function(state,
        identifier, lineNumber, opt_namespace) {
    var namespace = opt_namespace || identifier;

    var jsdoc = state.getDocComment();
    if (jsdoc && _.contains(jsdoc.suppressions, 'missingProvide')) {
        return;
    }

    this._createdNamespaces.push({namespace: namespace, identifier: identifier,
            lineNumber: lineNumber});
};


/**
 * Adds the namespace of an identifier to the list of used namespaces.
 *
 * If the identifier is annotated with a 'missingRequire' suppression, it is
 * not added.
 * @param {StateTracker} state The JavaScriptStateTracker instance.
 * @param {string} identifier An identifier which has been used.
 * @param {number} lineNumber Line number where namespace is used.
 * @private
 */
ClosurizedNamespacesInfo.prototype._addUsedNamespace = function(state,
        identifier, lineNumber) {
    var jsdoc = state.getDocComment();
    if (jsdoc && _.contains(jsdoc.suppressions, 'missingRequire')) {
        return;
    }

    var namespace = this.getClosurizedNamespace(identifier);
    // If its a variable in scope then its not a required namespace.
    if (namespace && !state.isVariableInScope(namespace)) {
        this._usedNamespaces.push({namespace: namespace, identifier: identifier,
            lineNumber: lineNumber});
    }
}


/**
 * Given an identifier, returns the namespace that identifier is from.
 *
 * @param {string} identifier The identifier to extract a namespace from.
 * @return {string} The namespace the given identifier resides in, or None if
 *      one could not be found.
 */
ClosurizedNamespacesInfo.prototype.getClosurizedNamespace = function(
        identifier) {
    if (_s.startsWith(identifier, 'goog.global')) {
        // Ignore goog.global, since it is, by definition, global.
        return null;
    }

    var parts = identifier.split('.');
    for (var i = 0; i < this._createdNamespaces.length; i++) {
        var namespace = this._closurizedNamespaces[i];

        if (!_s.startsWith(identifier, namespace + '.')) {
            continue;
        }

        var lastPart = _.last(parts);
        if (!lastPart) {
            // TODO(robbyw): Handle this: it's a multi-line identifier.
            return null;
        }

        // The namespace for a class is the shortest prefix ending in a class
        // name, which starts with a capital letter but is not a capitalized
        // word.
        //
        // We ultimately do not want to allow requiring or providing of inner
        // classes/enums.  Instead, a file should provide only the top-level
        // class and users should require only that.
        var namespace = [];
        for (var j = 0; j < parts.length; j++) {
            var part = parts[j];
            if (part == 'prototype' || part == part.toUpperCase()) {
                return namespace.join('.');
            }
            namespace.push(part);
            if (part[0] == part[0].toUpperCase()) {
                return namespace.join('.');
            }
        }

        // At this point, we know there's no class or enum, so the namespace is
        // just the identifier with the last part removed. With the exception of
        // apply, inherits, and call, which should also be stripped.
        if (_.contains(['apply', 'inherits', 'call'], _.last(parts))) {
            parts.pop();
        }
        parts.pop();

        // If the last part ends with an underscore, it is a private variable,
        // method, or enum. The namespace is whatever is before it.
        if (parts && _s.endsWith(_.last(parts), '_')) {
            parts.pop();
        }

        return parts.join('.');
    }

    return null;
};


exports.ClosurizedNamespacesInfo = ClosurizedNamespacesInfo;
