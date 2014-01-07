/**
 * Contains logic for sorting goog.provide and goog.require statements.
 *
 * Closurized JavaScript files use goog.provide and goog.require statements at
 * the top of the file to manage dependencies. These statements should be
 * sorted alphabetically, however, it is common for them to be accompanied by
 * inline comments or suppression annotations. In order to sort these statements
 * without disrupting their comments and annotations, the association between
 * statements and comments/annotations must be maintained while sorting.
 */


/**
 * Checks for and fixes alphabetization of provide and require statements.
 *
 * When alphabetizing, comments on the same line or comments directly above a
 * goog.provide or goog.require statement are associated with that statement and
 * stay with the statement as it gets sorted.
 * @constructor
 */
var RequireProvideSorter = function() {};


RequireProvideSorter.prototype.checkProvides = function(token) {};
RequireProvideSorter.prototype.getFixedProvideString = function(token) {};
RequireProvideSorter.prototype.checkRequires = function(token) {};
RequireProvideSorter.prototype.getFixedRequireString = function(token) {};


exports.RequireProvideSorter = RequireProvideSorter;
