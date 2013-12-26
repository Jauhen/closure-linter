/**
 * Main lint function. Tokenizes file, runs passes, and feeds to checker.
 */

var fs = require('fs');
var _ = require('underscore');
var _s = require('underscore.string');

var errors = require('./errors');
var error = require('../common/error');
var htmlUtil = require('../common/htmlutil');
var tokens = require('../common/tokens');
var javascriptTokenizer = require('./javascripttokenizer');
var ecmaMetadataPass = require('./ecmametadatapass');


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

var runMetadataPass = function(startToken, metadataPass, errorHandler,
                               filenamr) {
    try {
        metadataPass.process(startToken);
    } catch (e) {

    }
}

var isLimitedDocCheck = function(filename, limitedDocFiles) {
    return _.contains(limitedDocFiles, filename);
};

var runChecker = function(startToken, errorHandler, limitedDocChecks, isHtml,
                          stopToken) {

};

/**
 * Tokenize, run passes, and check the given file.
 *
 * @param {string} filename The path of the file to check.
 * @param {ErrorHandler} errorHandler The error handler to report errors to.
 * @param {string} opt_source A file-like object with the file source.
 *      If omitted, the file will be read from the filename path.
 */
var run = function(program, filename, errorHandler, opt_source) {
    var source = opt_source;
    if (!opt_source) {
        try {
            source = fs.readFileSync(filename, {encoding: 'utf8'});
        } catch(e) {
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
    var errorToken = null;

    var ecmaPass = ecmaMetadataPass.ecmaMetadataPass;
    errorToken = runMetadataPass(token, ecmaPass, errorHandler, filename);

    var limitedDocCheck = isLimitedDocCheck(filename,
            program.limited_doc_files);

    runChecker(token, errorHandler, limitedDocCheck, isHtml(filename),
            errorToken);

    errorHandler.finishFile();
};


exports.run = run;
