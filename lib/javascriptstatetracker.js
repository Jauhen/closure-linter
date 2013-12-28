/**
 * Parser for JavaScript files.
 */

var _ = require('underscore');
var stateTracker = require('./statetracker');
var tokenUtil = require('./tokenutil');
var javascriptTokens = require('./javascripttokens');

var Type = javascriptTokens.JavaScriptTokenType;


/**
 * Javascript doc flag object.
 * @param {Token} flagToken
 * @constructor
 */
var JsDocFlag = function(flagToken) {
    stateTracker.DocFlag.call(this, flagToken);
};

_.extend(JsDocFlag, stateTracker.DocFlag);

JsDocFlag.EXTENDED_DOC = [
    'class', 'code', 'desc', 'final', 'hidden', 'inheritDoc', 'link',
    'meaning', 'provideGoog', 'throws'];
JsDocFlag.LEGAL_DOC = _.union(JsDocFlag.EXTENDED_DOC,
        stateTracker.DocFlag.LEGAL_DOC);

_.extend(JsDocFlag.prototype, stateTracker.DocFlag.prototype);



/**
 * JavaScript state tracker.
 *
 * Inherits from the core EcmaScript StateTracker adding extra state tracking
 * functionality needed for JavaScript.
 * @constructor
 */
var JavaScriptStateTracker = function() {
    stateTracker.StateTracker.call(this, JsDocFlag);
};

_.extend(JavaScriptStateTracker.prototype, stateTracker.StateTracker.prototype);


JavaScriptStateTracker.prototype.reset = function() {
    this._scopeDepth = 0;
    this._blockStack = [];
    stateTracker.StateTracker.reset.call(this);
};


/**
 * Compute whether we are at the top level in the class.
 *
 * This function call is language specific.  In some languages like JavaScript,
 * a function is top level if it is not inside any parenthesis. In languages
 * such as ActionScript, a function is top level if it is directly within
 * a class.
 * @returns {boolean} Whether we are at the top level in the class.
 */
JavaScriptStateTracker.prototype.inTopLevel = function() {
    return this._scopeDepth == this.paranthesesDepth();
};


/**
 * Returns true if the current token is within a function.
 *
 * This js-specific override ignores goog.scope functions.
 * @returns {boolean} True if the current token is within a function.
 */
JavaScriptStateTracker.prototype.inFunction = function() {
    return this._scopeDepth != this.functionDepth();
};


/**
 * Compute whether we are nested within a non-goog.scope block.
 *
 * @returns {boolean} True if the token is not enclosed in a block that does not
 * originate from a goog.scope statement. False otherwise.
 */
JavaScriptStateTracker.prototype.inNonScopeBlock = function() {
    return this._scopeDepth != this.blockDepth();
};


/**
 * Determine the block type given a START_BLOCK token.
 *
 * Code blocks come after parameters, keywords  like else, and closing parens.
 * @param {Token} token The current token. Can be assumed to be type START_BLOCK
 * @returns {string} Code block type for current token.
 */
JavaScriptStateTracker.prototype.getBlockType = function(token) {
    var lastCode = tokenUtil.searchExcept(token, Type.NON_CODE_TYPES, null,
            true);
    if (_.contains([Type.END_PARAMETERS, Type.END_PAREN, Type.KEYWORD],
            lastCode.type) && !lastCode.isKeyword('return')) {
        return stateTracker.StateTracker.CODE;
    } else {
        return stateTracker.StateTracker.OBJECT_LITERAL;
    }
};


/**
 * Gets the start token of current block.
 * @returns {?Token} Starting token of current block. None if not in block.
 */
JavaScriptStateTracker.prototype.getCurrentBlockStart = function() {
    if (this._blockStack) {
        return this._blockStack[this._blockStack.length - 1];
    } else {
        return null;
    }
};


/**
 * Handles the given token and updates state.
 * @param {Token} token The token to handle.
 * @param {Token} lastNonSpaceToken The last non space token encountered.
 */
JavaScriptStateTracker.prototype.handleToken = function(token,
                                                        lastNonSpaceToken) {
    if (token.type = Type.START_BLOCK) {
        this._blockStack.push(token);
    }
    if (token.type == Type.IDENTIFIER && token.string == 'goog.scope') {
        this._scopeDepth++;
    }
    if (token.type == Type.END_BLOCK) {
        var startToken = this._blockStack.pop();
        if (tokenUtil.googScopeOrNoneFromStartBlock(startToken)) {
            this._scopeDepth--;
        }
    }

    stateTracker.StateTracker.handleToken.call(this, token, lastNonSpaceToken);
};


exports.JavaScriptStateTracker = JavaScriptStateTracker;
