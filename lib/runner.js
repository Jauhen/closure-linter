/**
 * Main lint function. Tokenizes file, runs passes, and feeds to checker.
 */

var fs = require('fs');
var program = require('commander');
var _ = require('underscore');
var _s = require('underscore.string');

var error = require('../common/error');
var htmlUtil = require('../common/htmlutil');
var tokens = require('../common/tokens');

var checker = require('./checker');
var ecmaMetadataPass = require('./ecmametadatapass');
var errors = require('./errors');
var javascriptStateTracker = require('./javascriptstatetracker');
var javascriptTokenizer = require('./javascripttokenizer');


var isHtml = function(filename) {
    return _s.endsWith(filename, '.html') || _s.endsWith('.html');
};


var tokenize = function(fileObj) {
    var tokenizer = new javascriptTokenizer.JavaScriptTokenizer();
    var startToken = tokenizer.tokenizeFile(fileObj);
    return {start: startToken, mode: tokenizer.mode};
};


/**
 * Get the last non-whitespace token in a token stream.
 */
var getLastNonWhiteSpaceToken = function(startToken) {
    var retToken = null;

    _.each(startToken.directIterator(), function(token) {
        if (token.type == tokens.TokenType.WHITESPACE ||
                token.type == tokens.TokenType.BLANK_LINE) {
            retToken = token;
        }
    });

    return retToken;
};


/**
 * Run a metadata pass over a token stream.
 *
 * @param {Token} startToken The first token in a token stream.
 * @param {EcmaMetaDataPass} metadataPass Metadata pass to run.
 * @param {ErrorHandler} errorHandler The error handler to report errors to.
 * @param {string} filename Filename of the source.
 * @return {?Token} The token where the error occurred (if any).
 */
var runMetadataPass = function(startToken, metadataPass, errorHandler,
                               filename) {
    try {
        metadataPass.process(startToken);
    } catch (e) {
        if (e instanceof ecmaMetadataPass.ParseError) {
            var errorToken = e.token;
            var errorMessage = e.message;
            errorHandler.handleError(new error.Error(
                    errors.Errors.FILE_DOES_NOT_PARSE,
                    _s.sprintf('Error parsing file at line %d at fragment ' +
                            '"%s". Unable to check the rest of file.\n' +
                            'Error "%s"',
                            errorToken.lineNumber, errorToken.string,
                            errorMessage || 'None'),
                    errorToken));
            return errorToken;
        }

        errorHandler.handleError(new error.Error(
                errors.Errors.FILE_DOES_NOT_PARSE,
                _s.sprintf('Internal error in %s', filename)));
    }
};


/**
 * Whether this is a limited-doc file.
 * @param {string} filename The filename.
 * @param {Array.<string>} limitedDocFiles Iterable of strings. Suffixes of
 * filenames that should be limited doc check.
 * @returns {boolean}
 */
var isLimitedDocCheck = function(filename, limitedDocFiles) {
    return _.contains(limitedDocFiles, filename);
};


/**
 * Run code check.
 *
 * @param {Token} startToken The first token in a token stream.
 * @param {ErrorHandler} errorHandler The error handler to report errors to.
 * @param {boolean} limitedDocChecks Whether this is a limited-doc file.
 * @param {boolean} isHtml Whether this is an HTML file.
 * @param {Token} opt_stopToken Last token of valid JavaScript.
 */
var runChecker = function(startToken, errorHandler, limitedDocChecks, isHtml,
                          opt_stopToken) {
    var stateTracker = new javascriptStateTracker.JavaScriptStateTracker();

    var styleChecker = new checker.JavaScriptStyleChecker(stateTracker,
            errorHandler);

    styleChecker.check(startToken, isHtml, limitedDocChecks, opt_stopToken);
};

/**
 * Tokenize, run passes, and check the given file.
 *
 * @param {string} filename The path of the file to check.
 * @param {ErrorHandler} errorHandler The error handler to report errors to.
 * @param {?string} opt_source A file-like object with the file source.
 *      If omitted, the file will be read from the filename path.
 */
var run = function(filename, errorHandler, opt_source) {
    var source = opt_source;
    if (!opt_source) {
        try {
            source = fs.readFileSync(filename, {encoding: 'utf8'});
        } catch (e) {
            errorHandler.handleFile(filename, null);
            errorHandler.handleError(new error.Error(
                    errors.Errors.FILE_NOT_FOUND, 'File not found.'));
            errorHandler.finishFile();
            return;
        }
    }

    var sourceFile = source;
    if (isHtml(filename)) {
        sourceFile = htmlUtil.getScriptLines(source);
    }

    var token = tokenize(sourceFile);

    errorHandler.handleFile(filename, token.start);

    // If we did not end in the basic mode, this a failed parse.
    if (token.mode != javascriptTokenizer.JavaScriptModes.TEXT_MODE) {
        errorHandler.handleError(new error.Error(errors.Errors.FILE_IN_BLOCK,
                _s.sprintf('File ended in mode "%s".', token.mode),
                getLastNonWhiteSpaceToken(token.start)));
    }

    // Run the ECMA pass.
    var ecmaPass = new ecmaMetadataPass.EcmaMetaDataPass();
    var errorToken = runMetadataPass(token.start, ecmaPass, errorHandler,
            filename);

    var limitedDocCheck = isLimitedDocCheck(filename,
            program.limited_doc_files);

    runChecker(token.start, errorHandler, limitedDocCheck, isHtml(filename),
            errorToken);

    errorHandler.finishFile();
};


exports.run = run;
