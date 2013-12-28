/**
 * Light weight EcmaScript state tracker that reads tokens and tracks state.
 */

var _ = require('underscore');
var _s = require('underscore.string');

var javascriptTokens = require('./javascripttokens');
var javascriptTokenizer = require('./javascripttokenizer');
var tokenUtil = require('./tokenutil');

var Type = javascriptTokens.JavaScriptTokenType;


/**
 * Helper methods used by DocFlag and DocComment to parse out flag information.
 */

/**
 * Returns the matching end brace and contents between the two braces.
 *
 * If any FLAG_ENDING_TYPE token is encountered before a matching end brace,
 * then that token is used as the matching ending token. Contents will have all
 * comment prefixes stripped out of them, and all comment prefixes in between
 * the start and end tokens will be split out into separate DOC_PREFIX tokens.
 *
 * @param {Token} startBrace The DOC_START_BRACE token immediately before
 *      desired contents.
 * @returns {{endToken: Token, contents: string}} The matching ending token
 * (DOC_END_BRACE or FLAG_ENDING_TYPE) and a string of the contents between
 * the matching tokens, minus any comment prefixes.
 */
var getMatchingEndBraceAndContents = function(startBrace) {
    var openCount = 1;
    var closeCount = 0;
    var contents = [];

    // We don't consider the start brace part of the type string.
    var token = startBrace.next;

    while (openCount != closeCount) {
        if (token.type == Type.DOC_START_BRACE) {
            openCount++;
        } else if (token.type == Type.DOC_END_BRACE) {
            closeCount++;
        }

        if (token.type != Type.DOC_PREFIX) {
            contents.push(token.string);
        }

        if (_.contains(Type.FLAG_ENDING_TYPES, token.type)) {
            break;
        }

        token = token.next;
    }

    // Don't include the end token (end brace, end doc comment, etc.) in type.
    token = token.previous;
    contents.pop();

    return {endToken: token, contents: contents.join('')};
};


/**
 * Returns the first token having identifier as substring after a token.
 *
 * Searches each token after the start to see if it contains an identifier.
 * If found, token is returned. If no identifier is found returns None.
 * Search is abandoned when a FLAG_ENDING_TYPE token is found.
 *
 * @param {Token} startToken The token to start searching after.
 * @returns {?Token} The token found containing identifier, null otherwise.
 */
var getNextPartialIdentifierToken = function(startToken) {
    var token = startToken.next;

    while (token && !_.contains(Type.FLAG_ENDING_TYPES, token.type)) {
        var match = javascriptTokenizer.JavaScriptTokenizer.IDENTIFIER.test(
                token.string);
        if (match && token.type == Type.COMMENT) {
            return token;
        }

        token = token.next;
    }

    return null;
};


var getEndTokenAndContents = function(startToken) {
    var iterator = startToken;
    var lastLine = iterator.lineNumber;
    var lastToken = null;
    var contents = '';
    var docDepth = 0;

    while (!_.contains(Type.FLAG_ENDING_TYPES, iterator.type) || docDepth > 0) {
        if (iterator.isFirstInLine() &&
                DocFlag.EMPTY_COMMENT_LINE.test(iterator.line)) {
            // If we have a blank comment line, consider that an implicit
            // ending of the description. This handles a case like:
            //
            // * @return {boolean} True
            // *
            // * Note: This is a sentence.
            //
            // The note is not part of the @return description, but there
            // was no definitive ending token. Rather there was a line
            // containing only a doc comment prefix or whitespace.
            break;
        }

        // Don't prematurely match against a @flag if inside a doc flag
        // need to think about what is the correct behavior for unterminated
        // inline doc flags.
        if (iterator.type == Type.DOC_START_BRACE &&
                iterator.next.type == Type.DOC_INLINE_FLAG) {
            docDepth++;
        } else if (iterator.type == Type.DOC_END_BRACE && docDepth > 0) {
            docDepth--;
        }

        if (_.contains(Type.FLAG_DESCRIPTION_TYPES, iterator.type)) {
            contents += iterator.string;
            lastToken = iterator;
        }

        iterator = iterator.next;

        if (iterator.lineNumber != lastLine) {
            contents += '\n';
            lastLine = iterator.lineNumber;
        }
    }

    if (DocFlag.EMPTY_STRING.test(contents)) {
        contents = null;
    } else {
        contents = contents.substr(0, contents.length - 1);
    }

    return {endToken: lastToken, contents: contents};
};


/**
 * Creates the DocFlag object and attaches it to the given start token.
 *
 * @param {Token} flagToken The starting token of the flag.
 * @constructor
 */
var DocFlag = function(flagToken) {
    this.flagToken = flagToken;
    this.flagType = _s.ltrim(flagToken.string.trim(), '@');

    // Extract type, if applicable.
    this.type = null;
    this.typeStartToken = null;
    this.typeEndToken = null;
    if (_.contains(DocFlag.HAS_TYPE, this.flagType)) {
        var brace = tokenUtil.searchUntil(flagToken, [Type.DOC_START_BRACE],
            Type.FLAG_ENDING_TYPES);
        if (brace) {
            var endTokenAndContents = getMatchingEndBraceAndContents(brace);
            this.type = endTokenAndContents.contents;
            this.typeStartToken = brace;
            this.typeEndToken = endTokenAndContents.endToken;
        } else if (_.contains(DocFlag.TYPE_ONLY, this.flagType) &&
                !_.contains(Type.FLAG_ENDING_TYPES, flagToken.next.type) &&
                flagToken.lineNumber == flagToken.next.lineNumber) {
            // If the flag is expected to be followed by a type then search for
            // type in same line only. If no token after flag in same line then
            // conclude that no type is specified.
            this.typeStartToken = flagToken.next;
            endTokenAndContents = getEndTokenAndContents(this.typeStartToken);
            this.typeEndToken = endTokenAndContents.endToken;
            this.type = endTokenAndContents.contents;
            if (this.type) {
                this.type = this.type.trim();
            }
        }
    }

    // Extract name, if applicable.
    this.nameToken = null;
    this.name = null;
    if (_.contains(DocFlag.HAS_NAME, this.flagType)) {
        // Handle bad case, name could be immediately after flag token.
        this.nameToken = getNextPartialIdentifierToken(flagToken);

        // Handle good case, if found token is after type start, look for
        // a identifier (substring to cover cases like [cnt] b/4197272) after
        // type end, since types contain identifiers.
        if (this.type && this.nameToken &&
                tokenUtil.compare(this.nameToken, this.typeStartToken) > 0) {
            this.nameToken = getNextPartialIdentifierToken(this.typeEndToken);
        }

        if (this.nameToken) {
            this.name = this.nameToken.string;
        }
    }

    // Extract description, if applicable.
    this.descriptionStartToken = null;
    this.descriptionEndToken = null;
    this.description = null;
    if (_.contains(DocFlag.HAS_DESCRIPTION, this.flagType)) {
        var searchStartToken = flagToken;
        if (this.nameToken && this.typeEndToken) {
            if (tokenUtil.compare(this.typeEndToken, this.nameToken) > 0) {
                searchStartToken = this.typeEndToken;
            } else {
                searchStartToken = this.nameToken;
            }
        } else if (this.nameToken) {
            searchStartToken = this.nameToken;
        } else if (this.type) {
            searchStartToken = this.typeEndToken;
        }

        var interestingToken = tokenUtil.search(searchStartToken,
                _.union(Type.FLAG_DESCRIPTION_TYPES, Type.FLAG_ENDING_TYPES));
        if (_.contains(Type.FLAG_DESCRIPTION_TYPES, interestingToken.type)) {
            this.descriptionStartToken = interestingToken;
            endTokenAndContents = getEndTokenAndContents(interestingToken);
            this.descriptionEndToken = endTokenAndContents.endToken;
            this.description = endTokenAndContents.contents;
        }
    }
};

// Please keep these lists alphabetized.

// The list of standard jsdoc tags is from.
DocFlag.STANDARD_DOC = [
    'author',
    'bug',
    'classTemplate',
    'consistentIdGenerator',
    'const',
    'constructor',
    'define',
    'deprecated',
    'dict',
    'enum',
    'export',
    'expose',
    'extends',
    'externs',
    'fileoverview',
    'idGenerator',
    'implements',
    'implicitCast',
    'interface',
    'lends',
    'license',
    'ngInject',  // This annotation is specific to AngularJS.
    'noalias',
    'nocompile',
    'nosideeffects',
    'override',
    'owner',
    'param',
    'preserve',
    'private',
    'protected',
    'public',
    'return',
    'see',
    'stableIdGenerator',
    'struct',
    'supported',
    'template',
    'this',
    'type',
    'typedef',
    'wizaction',  // This annotation is specific to Wiz.
    'wizmodule'  // This annotation is specific to Wiz.
];

DocFlag.ANNOTATION = ['preserveTry', 'suppress'];

DocFlag.LEGAL_DOC = _.union(DocFlag.STANDARD_DOC, DocFlag.ANNOTATION);

// Includes all Closure Compiler @suppress types.
// Not all of these annotations are interpreted by Closure Linter.
//
// Specific cases:
// - accessControls is supported by the compiler at the expression
//   and method level to suppress warnings about private/protected
//   access (method level applies to all references in the method).
//   The linter mimics the compiler behavior.
DocFlag.SUPPRES_TYPES = [
    'accessControls',
    'ambiguousFunctionDecl',
    'checkRegExp',
    'checkStructDictInheritance',
    'checkTypes',
    'checkVars',
    'const',
    'constantProperty',
    'deprecated',
    'duplicate',
    'es5Strict',
    'externsValidation',
    'extraProvide',
    'extraRequire',
    'fileoverviewTags',
    'globalThis',
    'internetExplorerChecks',
    'invalidCasts',
    'missingProperties',
    'missingProvide',
    'missingRequire',
    'missingReturn',
    'nonStandardJsDocs',
    'strictModuleDepCheck',
    'tweakValidation',
    'typeInvalidation',
    'undefinedNames',
    'undefinedVars',
    'underscore',
    'unknownDefines',
    'unusedPrivateMembers',
    'uselessCode',
    'visibility',
    'with'];

DocFlag.HAS_DESCRIPTION = [
    'define', 'deprecated', 'desc', 'fileoverview', 'license', 'param',
    'preserve', 'return', 'supported'];

DocFlag.HAS_TYPE = ['define', 'enum', 'extends', 'implements', 'param',
    'return', 'type', 'suppress', 'const'];

DocFlag.TYPE_ONLY = ['enum', 'extends', 'implements', 'suppress', 'type',
    'const'];

DocFlag.HAS_NAME = ['param'];

DocFlag.EMPTY_COMMENT_LINE = /^\s*\*?\s*$/;
DocFlag.EMPTY_STRING = /^\s*$/;


/**
 * JavaScript doc comment object.
 * @param {Token} startToken The first token in the doc comment.
 * @constructor
 */
var DocComment = function(startToken) {
    /**
     * @type {Array.<DocFlag>}
     * @private
     */
    this._flags = [];
    this.startToken = startToken;
    this.endToken = null;
    this.suppressions = {};
    /** @type {boolean} */
    this.invalidated = false;
};


/**
 * Gives the list of parameter names as a list of strings.
 * @returns {Array.<string>}
 */
DocComment.prototype.orderedParams = function() {
    var params = [];
    _.each(this._flags, function(flag) {
        if (flag.flagType == 'param' && flag.name) {
            params.push(flag.name);
        }
    });
    return params;
};


/**
 * Indicate that the JSDoc is well-formed but we had problems parsing it.
 *
 * This is a short-circuiting mechanism so that we don't emit false
 * positives about well-formed doc comments just because we don't support
 * hot new syntaxes.
 */
DocComment.prototype.invalidate = function() {
    this.invalidated = true;
};


/**
 * Test whether Invalidate() has been called.
 * @returns {boolean}
 */
DocComment.prototype.isInvalidated = function() {
    return this.invalidated;
};


/**
 * Add a new error suppression flag.
 * @param {Token} token The suppression flag token.
 */
DocComment.prototype.addSuppression = function(token) {
    var brace = tokenUtil.searchUntil(token, [Type.DOC_START_BRACE],
            [Type.DOC_FLAG]);
    if (brace) {
        var endTokenAndContents = getMatchingEndBraceAndContents(brace);
        _.each(endTokenAndContents.contents.split('|'), function(suppression) {
            this.suppressions[suppression] = token;
        }, this);
    }
};


/**
 * Returns whether this comment contains only suppression flags.
 * @returns {boolean}
 */
DocComment.prototype.suppressionOnly = function() {
    if (!this._flags) {
        return false;
    }

    return _.every(this._flags, function(flag) {
        return flag.flagType == 'suppress';
    });
};


/**
 * Add a new document flag.
 * @param {DocFlag} flag
 */
DocComment.prototype.addFlag = function(flag) {
    this._flags.push(flag);
};


/**
 * Test if the jsdoc implies documentation inheritance.
 * @returns {boolean} True if documentation may be pulled off the superclass.
 */
DocComment.prototype.inheritsDocumentation = function() {
    return this.hasFlag('inheritDoc') || this.hasFlag('override');
};


/**
 * Test if the given flag has been set.
 * @param {string} flagType The type of the flag to check.
 * @returns {boolean} True if the flag is set.
 */
DocComment.prototype.hasFlag = function(flagType) {
    return _.some(this._flags, function(flag) {
        return flag.flagType == flagType;
    });
};


/**
 * Gets the last flag of the given type.
 * @param {string} flagType The type of the flag to get.
 * @returns {DocFlag} The last instance of the given flag type in this doc
 *      comment.
 */
DocComment.prototype.getFlag = function(flagType) {
    return _.find(this._flags.reverse(), function(flag) {
        return flag.flagType == flagType;
    });
};


/**
 * Return the doc flags for this comment.
 * @returns {Array.<DocFlag>}
 */
DocComment.prototype.getDocFlags = function() {
    return this._flags;
};


/**
 * @returns {Array.<Token>}
 * @private
 */
DocComment.prototype._yeildDescriptionToken = function() {
    var result = [];
    _.some(this.startToken.directIterator(), function(token) {
        if (token == this.endToken || token.type == Type.DOC_FLAG ||
                !_.contains(Type.COMMENT_TYPES)) {
            return true;
        }

        if (!_.contains([Type.START_DOC_COMMENT, Type.END_DOC_COMMENT,
                Type.DOC_PREFIX], token.type)) {
            result.push(token);
        }
    }, this);

    return result;
};


/**
 * @returns {string}
 */
DocComment.prototype.description = function() {
    return tokenUtil.tokensToString(this._yeildDescriptionToken());
};


/**
 * Returns the identifier (as a string) that this is a comment for.
 *
 * Note that this uses method uses GetIdentifierForToken to get the full
 * identifier, even if broken up by whitespace, newlines, or comments,
 * and thus could be longer than GetTargetToken().string.
 *
 * @returns {string} The identifier for the token this comment is for.
 */
DocComment.prototype.getTargetIdentifier = function() {
    var token = this.getTargetToken();
    if (token) {
        return tokenUtil.getIdentifierForToken(token);
    }
};


/**
 * Get this comment's target token.
 * @returns {?Token} The token that is the target of this comment, or null if
 *      there isn't one.
 */
DocComment.prototype.getTargetToken = function() {
    // File overviews describe the file, not a token.
    if (this.hasFlag('fileoverview')) {
        return null;
    }

    var SKIP_TYPES = [Type.WHITESPACE, Type.BLANK_LINE, Type.START_PAREN];
    var TARGET_TYPES = [Type.FUNCTION_NAME, Type.IDENTIFIER,
        Type.SIMPLE_LVALUE];

    var token = this.endToken.next;

    while (token) {
        if (_.contains(TARGET_TYPES, token.type)) {
            return token;
        }

        // Handles the case of a comment on "var foo = ...'
        if (token.isKeyword('var')) {
            var nextCodeToken = tokenUtil.customSearch(token, function(t) {
                return !_.contains(Type.NON_CODE_TYPES, t.type);
            });

            if (nextCodeToken && nextCodeToken.isType(Type.SIMPLE_LVALUE)) {
                return nextCodeToken;
            }

            return null;
        }

        // Handles the case of a comment on "function foo () {}".
        if (token.type == Type.FUNCTION_DECLARATION) {
            var nextCodeToken = tokenUtil.customSearch(token, function(t) {
                return !_.contains(Type.NON_CODE_TYPES, t.type);
            });

            if (nextCodeToken && nextCodeToken.isType(Type.FUNCTION_NAME)) {
                return nextCodeToken;
            }

            return null;
        }

        // Skip types will end the search.
        if (!_.contains(SKIP_TYPES, token.type)) {
            return null;
        }

        token = token.next;
    }
};


/**
 * Computes the edit distance and list from the function params to the docs.
 * @param {Array} params The parameter list for the function declaration.
 * @return {distance: number, list: Array} The edit distance, the edit list.
 */
DocComment.prototype.compareParameters = function(params) {
    throw 'Non implemented';
    //_s.levenshtein
};


/**
 * Returns a string representation of this object.
 * @returns {string} A string representation of this object.
 */
DocComment.prototype.toString = function() {
    return _s.sprintf('<DocComment: %s, %s>', this.orderedParams(),
            this._flags);
};


/**
 * Data about a JavaScript function.
 * @param {number} blockDepth Block depth the function began at.
 * @param {boolean} isAssigned If the function is part of an assignment.
 * @param {DocComment} doc The DocComment associated with the function.
 * @param {string} name The name of the function, whether given in the function
 *      keyword or as the lvalue the function is assigned to.
 * @constructor
 */
var JsFunction = function(blockDepth, isAssigned, doc, name) {
    this.blockDepth = blockDepth;
    this.isAssigned = isAssigned;
    this.isConstructor = doc && doc.hasFlag('constructor');
    this.isInterface = doc && doc.hasFlag('interface');
    this.hasReturn = false;
    this.hasThrow = false;
    this.hasThis = false;
    this.name = name;
    this.doc = doc;
    this.startToken = null;
    this.endToken = null;
    this.parameters = null;
};


/**
 * EcmaScript state tracker.
 *
 * @param {?Function} opt_docFlag Tracks block depth, function names, etc.
 *      within an EcmaScript token stream.
 * @constructor
 */
var StateTracker = function(opt_docFlag) {
    this._docFlag = opt_docFlag;
};


/**
 * Resets the state tracker to prepare for processing a new page.
 */
StateTracker.prototype.reset = function() {
    this._blockDepth = 0;
    this._isBlockClose = false;
    this._parentDepth = 0;
    this._functionStack = [];
    this._functionsByName = {};
    this._lastComment = null;
    this._docComment = null;
    this._cumulativeParams = null;
    this._blockTypes = [];
    this._lastNonSpaceToken = null;
    this._lastLine = null;
    this._firstToken = null;
    this._documentedIdentifiers = [];
    this._variablesInScope = [];
};


/**
 * Returns true if the current token is within a function.
 * @returns {boolean} True if the current token is within a function.
 */
StateTracker.prototype.inFunction = function() {
    return !!this._functionStack;
};


/**
 * Returns true if the current token is within a constructor.
 * @returns {boolean} True if the current token is within a constructor.
 */
StateTracker.prototype.inConstructor = function() {
    return this.inFunction() && _.last(this._functionStack).isConstructor;
};


/**
 * Returns true if the current token is within an interface method.
 * @returns {boolean} True if the current token is within an interface method.
 */
StateTracker.prototype.inInterfaceMethod = function() {
    if (this.inFunction()) {
        if (_.last(this._functionStack).isInterface) {
            return true;
        } else {
            var name = _.last(this._functionStack).name;
            var prototypeIndex = name.indexOf('.prototype.');
            if (prototypeIndex != -1) {
                var classFunctionName = name.substr(0, prototypeIndex);
                if (_.contains(_.keys(this._functionsByName),
                        classFunctionName) &&
                        this._functionsByName[classFunctionName].isInterface) {
                    return true;
                }
            }
        }
    }

    return false;
};


/**
 * Returns true if the current token is within a top level function.
 * @returns {boolean} True if the current token is within a top level function.
 */
StateTracker.prototype.inTopLevelFunction = function() {
    return this._functionStack.length == 1 && this.inTopLevel();
};


/**
 * Returns true if the current token is within a function variable.
 * @return {boolean} True if if the current token is within a function variable.
 */
StateTracker.prototype.inAssignedFunction = function() {
    return this.inFunction() && _.last(this._functionStack).isAssigned;
};


/**
 * Returns true if the current token is a function block open.
 * @returns {boolean} True if the current token is a function block open.
 */
StateTracker.prototype.isFunctionOpen = function() {
    return !!this._functionStack &&
            (_.last(this._functionStack).blockDepth == this._blockDepth - 1);
};


/**
 * Returns true if the current token is a function block close.
 * @returns {boolean} True if the current token is a function block close.
 */
StateTracker.prototype.isFunctionClose = function() {
    return !!this._functionStack &&
            _.last(this._functionStack).blockDepth == this._blockDepth;
};


/**
 * Returns true if the current token is within a block.
 * @returns {boolean} True if the current token is within a block.
 */
StateTracker.prototype.inBlock = function() {
    return !!this._blockDepth;
};


/**
 * Returns true if the current token is a block close.
 * @returns {boolean} True if the current token is a block close.
 */
StateTracker.prototype.isBlockClose = function() {
    return this._isBlockClose;
};


/**
 * Returns true if the current token is within an object literal.
 * @returns {boolean} True if the current token is within an object literal.
 */
StateTracker.prototype.inObjectLiteral = function() {
    return !!this._blockDepth &&
            _.last(this._blockTypes) == StateTracker.OBJECT_LITERAL;
};


/**
 * Returns true if the current token has an object literal ancestor.
 * @returns {boolean} True if the current token has an object literal ancestor.
 */
StateTracker.prototype.inObjectLiteralDescendant = function() {
    return _.contains(this._blockTypes, StateTracker.OBJECT_LITERAL);
};


/**
 * Returns true if the current token is within parentheses.
 * @returns {boolean} True if the current token is within parentheses.
 */
StateTracker.prototype.inParantheses = function() {
    return !!this._parentDepth;
};


/**
 * Returns the number of parens surrounding the token.
 * @returns {number} The number of parenthesis surrounding the token.
 */
StateTracker.prototype.parenthesesDepth = function() {
    return this._parentDepth;
};


/**
 * Returns the number of blocks in which the token is nested.
 * @returns {number} The number of blocks in which the token is nested.
 */
StateTracker.prototype.blockDepth = function() {
    return this._blockDepth;
};


/**
 * Returns the number of functions in which the token is nested.
 * @returns {number} The number of functions in which the token is nested.
 */
StateTracker.prototype.functionDepth = function() {
    return this._functionStack.length;
};


/**
 * Whether we are at the top level in the class.
 *
 * This function call is language specific.  In some languages like JavaScript,
 * a function is top level if it is not inside any parenthesis. In languages
 * such as ActionScript, a function is top level if it is directly within
 * a class.
 */
StateTracker.prototype.inTopLevel = function() {
    throw new TypeError('Abstract method inTopLevel not implemented.');
};


/**
 * Determine the block type given a START_BLOCK token.
 *
 * Code blocks come after parameters, keywords  like else, and closing parens.
 *
 * @param {Token} token The current token. Can be assumed to be type
 *      START_BLOCK.
 * @return {Type} Code block type for current token.
 */
StateTracker.prototype.getBlockType = function(token) {
    throw new TypeError('Abstract method getBlockType not implemented.');
};


/**
 * Returns the accumulated input params as an array.
 *
 * In some EcmasSript languages, input params are specified like
 * (param:Type, param2:Type2, ...)
 * in other they are specified just as
 * (param, param2)
 * We handle both formats for specifying parameters here and leave
 * it to the compilers for each language to detect compile errors.
 * This allows more code to be reused between lint checkers for various
 * EcmaScript languages.
 *
 * @returns {Array.<string>} The accumulated input params as an array.
 */
StateTracker.prototype.getParams = function() {
    var params = [];
    if (this._cumulativeParams) {
        params = this._cumulativeParams.replace(/\s+/gm, '').split(',');
        // Strip out the type from parameters of the form name:Type.
        params = _.map(params, function(param) {return param.split(':')[0]});
    }
    return params;
};


/**
 * Return the last plain comment that could be used as documentation.
 * @returns {?DocComment} The last plain comment that could be used as
 *      documentation.
 */
StateTracker.prototype.getLastComment = function() {
    return this._lastComment;
};


/**
 * Return the most recent applicable documentation comment.
 * @returns {?DocComment} The last applicable documentation comment.
 */
StateTracker.prototype.getDocComment = function() {
    return this._docComment;
};


/**
 * Returns whether the identifier has been documented yet.
 * @param {string} identifier The identifier.
 * @returns {boolean} Whether the identifier has been documented yet.
 */
StateTracker.prototype.hasDocComment = function(identifier) {
    return _.contains(this._documentedIdentifiers, identifier);
};


/**
 * Returns whether the current token is in a doc comment.
 * @returns {boolean} Whether the current token is in a doc comment.
 */
StateTracker.prototype.inDocComment = function() {
    return !!this._docComment && this._docComment.endToken == null;
};


/**
 * Returns the current documentation flags.
 * @returns {?DocFlag} The current documentation flags.
 */
StateTracker.prototype.getDocFlag = function() {
    return this._docFlag;
};


/**
 * Whether token is type declaration.
 * @param {Token} token
 * @returns {boolean}
 */
StateTracker.prototype.isTypeToken = function(token) {
    if (this.inDocComment() && !_.contains([Type.START_DOC_COMMENT,
            Type.DOC_FLAG, Type.DOC_INLINE_FLAG, Type.DOC_PREFIX],
                token.type)) {
        var finalToken = tokenUtil.searchUntil(token, [Type.DOC_FLAG],
                [Type.START_DOC_COMMENT], null, true);
        if (finalToken && finalToken.attachedObject.typeStartToken != null &&
                finalToken.attachedObject.typeEndToken != null) {
            return (tokenUtil.compare(token,
                            finalToken.attachedObject.typeStartToken) > 0 &&
                    tokenUtil.compare(token,
                            finalToken.attachedObject.typeEndToken) < 0);
        }
    }
    return false;
};


/**
 * Return the function the current code block is a part of.
 * @returns {JsFunction} The current Function object.
 */
StateTracker.prototype.getFunction = function() {
    if (this._functionStack) {
        return _.last(this._functionStack);
    }
};


/**
 * Return the block depth.
 * @returns {number} The current block depth.
 */
StateTracker.prototype.getBlockDepth = function() {
    return this._blockDepth;
};


/**
 * Return the last non whitespace token.
 * @returns {Token}
 */
StateTracker.prototype.getLastNonSpaceToken = function() {
    return this._lastNonSpaceToken;
};


/**
 * Return the last line.
 * @returns {?string}
 */
StateTracker.prototype.getLastLine = function() {
    return this._lastLine;
};


/**
 * Return the very first token in the file.
 * @returns {?Token}
 */
StateTracker.prototype.getFirstToken = function() {
    return this._firstToken;
};


/**
 * Checks if string is variable in current scope.
 *
 * For given string it checks whether the string is a defined variable (including function param) in current state.
 *
 * E.g. if variables defined (variables in current scope) is docs then docs,
 * docs.length etc will be considered as variable in current scope. This will
 * help in avoding extra goog.require for variables.
 *
 * @param {string} tokenString String to check if its is a variable in current
 *      scope.
 * @returns {boolean} True if given string is a variable in current scope.
 */
StateTracker.prototype.isVariableInScope = function(tokenString) {
    return _.find(this._variablesInScope, function(variable) {
       return (tokenString == variable ||
               _s.startsWith(tokenString, variable + '.'));
    });
};


/**
 * Handles the given token and updates state.
 * @param {Token} token The token to handle.
 * @param {Token} lastNonSpaceToken
 */
StateTracker.prototype.handleToken = function(token, lastNonSpaceToken) {
    this._isBlockClose = false;

    if (!this._firstToken) {
        this._firstToken = token;
    }

    // Track block depth.
    var type = token.type;

    if (type == Type.START_BLOCK) {
        this._blockDepth++;

        // Subclasses need to handle block start very differently because
        // whether a block is a CODE or OBJECT_LITERAL block varies
        // significantly by language.
        this._blockTypes.push(this.getBlockType(token));

        // When entering a function body, record its parameters.
        if (this.inFunction()) {
            var jsFunction = _.last(this._functionStack);
            if (this._blockDepth == jsFunction.blockDepth + 1) {
                jsFunction.parameters = this.getParams();
            }
        }

    // Track block depth.
    } else if (type == Type.END_BLOCK) {
        this._isBlockClose = !this.inObjectLiteral();
        this._blockDepth--;
        this._blockTypes.pop();

    // Track parentheses depth.
    } else if (type == Type.START_PAREN) {
        this._parentDepth++;

    // Track parentheses depth.
    } else if (type == Type.END_PAREN) {
        this._parentDepth--;

    } else if (type == Type.COMMENT) {
        this._lastComment = token.string;

    } else if (type == Type.START_DOC_COMMENT) {
        this._lastComment = null;
        this._docComment = new DocComment(token);

    } else if (_.contains([Type.DOC_FLAG, Type.DOC_INLINE_FLAG], type)) {
        var flag = new this._docFlag(token);
        token.attachedObject = flag;
        this._docComment.addFlag(flag);

        if (flag.flagType == 'suppress') {
            this._docComment.addSuppression(token);
        }

    } else if (type == Type.FUNCTION_DECLARATION) {
        var lastCode = tokenUtil.searchExcept(token, [Type.NON_CODE_TYPES],
                null, true);
        var doc = null;

        // Only functions outside of parens are eligible for documentation.
        if (!this._parentDepth) {
            doc = this._docComment;
        }

        var name = '';
        var isAssigned = lastCode && (lastCode.isOperator('=') ||
                lastCode.isOperator('||') || lastCode.isOperator('&&') ||
                (lastCode.isOperator(':') && !this.inObjectLiteral()));

        if (isAssigned) {
            // TODO(robbyw): This breaks for x[2] = ...
            // Must use loop to find full function name in the case of
            // line-wrapped declarations (bug 1220601) like:
            // my.function.foo.
            //   bar = function() ...
            var identifier = tokenUtil.search(lastCode, [Type.SIMPLE_LVALUE],
                    null, true);
            while (identifier && _.contains(
                    [Type.IDENTIFIER, Type.SIMPLE_LVALUE], identifier.type)) {
                name = identifier.string + name;

                // Traverse behind us, skipping whitespace and comments.
                while (true) {
                    identifier = identifier.previous;
                    if (!identifier ||
                            !_.contains(Type.NON_CODE_TYPES, identifier.type)) {
                        break;
                    }
                }
            }
        } else {
            var nextToken = tokenUtil.searchExcept(token, Type.NON_CODE_TYPES);
            while (nextToken && nextToken.isType(Type.FUNCTION_NAME)) {
                name += nextToken.string;
                nextToken = tokenUtil.search(nextToken,
                        [Type.FUNCTION_NAME], 2, false);
            }
        }

        var jsFunction = new JsFunction(
                this._blockDepth, isAssigned, doc, name);
        jsFunction.startToken = token;

        this._functionStack.push(jsFunction);
        this._functionsByName[name] = jsFunction;

        // Add a delimiter in stack for scope variables to define start of
        // function. This helps in popping variables of this function when
        // function declaration ends.
        this._variablesInScope.push('');

    } else if (type == Type.START_PARAMETERS) {
        this._cumulativeParams = '';

    } else if (type == Type.PARAMETERS) {
        this._cumulativeParams = this._cumulativeParams + token.string;
        this._variablesInScope =
                _.union(this._variablesInScope, this.getParams());

    } else if (type == Type.KEYWORD && token.string == 'return') {
        nextToken = tokenUtil.searchExcept(token, Type.NON_CODE_TYPES);
        if (!nextToken.isType(Type.SEMICOLON)) {
            jsFunction = this.getFunction();
            if (jsFunction) {
                jsFunction.hasReturn = true;
            }
        }

    } else if (type == Type.KEYWORD && token.string == 'throw') {
        jsFunction = this.getFunction();
        if (jsFunction) {
            jsFunction.hasThrow = true;
        }

    } else if (type == Type.KEYWORD && token.string == 'var') {
        jsFunction = this.getFunction();
        nextToken = tokenUtil.search(token,
                [Type.IDENTIFIER, Type.SIMPLE_LVALUE]);

        if (nextToken) {
            if (nextToken.type == Type.SIMPLE_LVALUE) {
                this._variablesInScope.push(nextToken.values['identifier']);
            } else {
                this._variablesInScope.push(nextToken.string);
            }
        }

    } else if (type == Type.SIMPLE_LVALUE) {
        identifier = token.values['identifier'];
        var jsdoc = this.getDocComment();
        if (jsdoc) {
            this._documentedIdentifiers.push(identifier);
        }

        this._handleIdentifier(identifier, true);

    } else if (type == Type.IDENTIFIER) {
        this._handleIdentifier(token.string, false);

        // Detect documented non-assignments.
        nextToken = tokenUtil.searchExcept(token, Type.NON_CODE_TYPES);
        if (nextToken && nextToken.isType(Type.SEMICOLON)) {
            if (this._lastNonSpaceToken &&
                    this._lastNonSpaceToken.isType(Type.END_DOC_COMMENT)) {
                this._documentedIdentifiers.push(token.string);
            }
        }
    }
};


/**
 * Process the given identifier.
 *
 * Currently checks if it references 'this' and annotates the function
 * accordingly.
 *
 * @param {string} identifier The identifier to process.
 * @param {boolean} isAssignment Whether the identifier is being written to.
 * @private
 */
StateTracker.prototype._handleIdentifier = function(identifier, isAssignment) {
    if (identifier == 'this' || _s.startsWith(identifier, 'this.')) {
        var jsFunction = this.getFunction();
        if (jsFunction) {
            jsFunction.hasThis = true;
        }
    }
};


/**
 * Handle updating state after a token has been checked.
 *
 * This function should be used for destructive state changes such as
 * deleting a tracked object.
 *
 * @param {Token} token The token to handle.
 */
StateTracker.prototype.handleAfterToken = function(token) {
    var type = token.type;
    if (type == Type.SEMICOLON || type == Type.END_PAREN ||
            (type == Type.END_BRACKET && !_.contains(
                    [Type.SINGLE_QUOTE_STRING_END,
                        Type.DOUBLE_QUOTE_STRING_END],
                    this._lastNonSpaceToken.type))) {
        // We end on any numeric array index, but keep going for string based
        // array indices so that we pick up manually exported identifiers.
        this._docComment = null;
        this._lastComment = null;

    } else if (type == Type.END_BLOCK) {
        this._docComment = null;
        this._lastComment = null;

        if (this.inFunction() && this.isFunctionClose()) {
            // TODO(robbyw): Detect the function's name for better errors.
            var jsFunction = this._functionStack.pop();
            jsFunction.endToken = token;

            // Pop all variables till delimiter ('') those were defined in the
            // function being closed so make them out of scope.
            while (this._variablesInScope && _.last(this._variablesInScope)) {
                this._variablesInScope.pop();
            }

            // Pop delimiter.
            if (this._variablesInScope) {
                this._variablesInScope.pop();
            }
        }

    } else if (type == Type.END_PARAMETERS && this._docComment) {
        this._docComment = null;
        this._lastComment = null;
    }

    if (!token.isAnyType([Type.WHITESPACE, Type.BLANK_LINE])) {
        this._lastNonSpaceToken = token;
    }

    this._lastLine = token.line;
};


StateTracker.OBJECT_LITERAL = 'o';
StateTracker.CODE = 'c';


exports.DocFlag = DocFlag;
exports.StateTracker = StateTracker;
