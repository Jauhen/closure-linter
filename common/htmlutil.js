/**
 * Utilities for dealing with HTML.
 */

var htmlparser = require('htmlparser');
var _ = require('underscore');
var _s = require('underscore.string');


/**
 * Extracts script contents from an HTML file.
 *
 * Also inserts appropriate blank lines so that line numbers in the extracted
 * code match the line numbers in the original HTML.
 * @param {string} html Content of HTML file.
 * @constructor
 */
var ScriptExtractor = function(html) {
    this.output = [];
    this.handler = new htmlparser.DefaultHandler();
    this.handler.handleElement = ScriptExtractor.handleElement;
    this.parser = new htmlparser.Parser(this.handler);
    this.parser.parseComplete(html);
};


/**
 * Enhanced handleElement method of htmlparser.DefaultHandler that stores
 * close tag raw data, that needed to calculate number of lines in HTML.
 * This needed, because tags like </div\n> move all code one line down.
 *
 * @param {Object} element Element to be added to tree.
 * @property {DefaultHandler} this This method is called as member of
 *      DefaultHandler.
 */
ScriptExtractor.handleElement = function(element) {
    if (this._done) {
        this.handleCallback(new Error(
                'Writing to the handler after done() called is not allowed ' +
                        'without a reset()'));
    }

    if (!this._options.verbose) {
        //			element.raw = null; //FIXME: Not clean
        //FIXME: Serious performance problem using delete
        delete element.raw;
        if (element.type == htmlparser.ElementType.Tag ||
                element.type == htmlparser.ElementType.Script ||
                element.type == htmlparser.ElementType.Style)
            delete element.data;
    }

    // There are no parent elements.
    if (!this._tagStack.last()) {
        // If the element can be a container, add it to the tag stack and the
        // top level list.
        if (element.type != htmlparser.ElementType.Text &&
                element.type != htmlparser.ElementType.Comment &&
                element.type != htmlparser.ElementType.Directive) {

            // Ignore closing tags that obviously don't have an opening tag.
            if (element.name.charAt(0) != '/') {
                this.dom.push(element);
                // Don't add tags to the tag stack that can't have children.
                if (!this.isEmptyTag(element)) {
                    this._tagStack.push(element);
                }
            }
        // Otherwise just add to the top level list.
        } else {
            this.dom.push(element);
        }
    // There are parent elements.
    } else {
        // If the element can be a container, add it as a child of the element
        // on top of the tag stack and then add it to the tag stack.
        if (element.type != htmlparser.ElementType.Text &&
                element.type != htmlparser.ElementType.Comment &&
                element.type != htmlparser.ElementType.Directive) {
            if (element.name.charAt(0) == '/') {
                // This is a closing tag, scan the tagStack to find the matching
                // opening tag and pop the stack up to the opening tag's parent.
                var baseName = element.name.substring(1);
                if (!this.isEmptyTag(element)) {
                    var pos = this._tagStack.length - 1;
                    while (pos > -1 && this._tagStack[pos--].name != baseName) { }
                    if (pos > -1 || this._tagStack[0].name == baseName) {
                        while (pos < this._tagStack.length - 1) {
                            var openTag = this._tagStack.pop();
                            // Add closeRaw property to open tag element.
                            openTag.closeRaw = element.raw;
                        }
                    }
                }
            // This is not a closing tag.
            } else {
                if (!this._tagStack.last().children) {
                    this._tagStack.last().children = [];
                }
                this._tagStack.last().children.push(element);
                // Don't add tags to the tag stack that can't have children.
                if (!this.isEmptyTag(element)) {
                    this._tagStack.push(element);
                }
            }
        // This is not a container element.
        } else {
            if (!this._tagStack.last().children) {
                this._tagStack.last().children = [];
            }
            this._tagStack.last().children.push(element);
        }
    }
};


/**
 * Depth-first traversal of parsed DOM and add to result output line brakes and
 * lines of JavaScript code.
 *
 * @param {Object} parsedHtml Current subtree.
 */
ScriptExtractor.prototype.getLines = function(parsedHtml) {
    _.each(parsedHtml, function(node) {
        var script = '';
        if (node.type == 'script' && (!node.attribs || !node.attribs.src)) {
            script = node.children ? node.children[0].raw : '';
        }

        var numberOfLines = _s.count(node.raw, '\n');
        for(var i = 0; i < numberOfLines; i++) {
            this.output.push('\n');
        }
        if (!script && node.children) {
            this.getLines(node.children);
        }
        if (script) {
            this.output.push(script);
        }
        if (node.closeRaw) {
            var numberOfLines = _s.count(node.closeRaw, '\n');
            for(var i = 0; i < numberOfLines; i++) {
                this.output.push('\n');
            }
        }
    }, this);
};


/**
 * Runs traversing of parsed DOM and output only javascript code.
 *
 * @return {string} JavaScript skimmed from HTML.
 */
ScriptExtractor.prototype.getScriptLines = function() {
    this.output = [];

    this.getLines(this.handler.dom);

    return this.output.join('');
};


/**
 * Extract script tag contents from the given HTML file.
 *
 * @param {string} f The HTML file.
 * @returns {string} Lines in the HTML file that are from script tags.
 */
var getScriptLine = function(f) {
    var extractor = new ScriptExtractor(f);
    return extractor.getScriptLines();
};


exports.getScriptLines = getScriptLine;
