/**
 * Classes to represent positions within strings.
 */


/**
 * Object representing a segment of a string.
 * @param {number} start The start index.
 * @param {number} length The number of characters to include.
 * @constructor
 */
var Position = function(start, length) {
    this.start = start;
    this.length = length;
};


/**
 * Returns this range of the given string.
 * @param {string} string The string to slice.
 * @returns {string} The string within the range specified by this object.
 */
Position.prototype.get = function(string) {
    return string.substr(this.start, this.length);
};


/**
 * Sets this range within the target string to the source string.
 * @param {string} target The target string.
 * @param {string} source The source string.
 * @returns {string}
 */
Position.prototype.set = function(target, source) {
    return target.substr(0, this.start) + source +
            target.substr(this.start + this.length);
};


/**
 * Returns whether this position is at the end of the given string.
 * @param {string} string The string to test for the end of.
 * @returns {boolean} Whether this position is at the end of the given string.
 */
Position.prototype.isAtEnd = function(string) {
    return this.start == string.length && this.length == 0;
};


/**
 * Returns whether this position is at the beginning of any string.
 * @returns {boolean} Whether this position is at the beginning of any string.
 */
Position.prototype.isAtBeginning = function() {
    return this.start == 0 && this.length == 0;
};


/**
 * Create a Position representing the end of the given string.
 * @param {string} string The string to represent the end of.
 * @returns {Position} The created Position object.
 */
Position.atEnd = function(string) {
    return new Position(string.length, 0);
};


/**
 * Create a Position representing the beginning of any string.
 * @returns {Position} The created Position object.
 */
Position.atBeginning = function() {
    return new Position(0, 0);
};


/**
 * Create a Position representing the entire string.
 * @param {string} string The string to represent the entirety of.
 * @returns {Position} The created Position object.
 * @constructor
 */
Position.all = function(string) {
    return new Position(0, string.length);
};


/**
 * Returns a Position object for the specified index.
 * @param {number} index The index to select, inclusively.
 * @returns {Position} The created Position object.
 */
Position.index = function(index) {
    return new Position(index, 1);
};


exports.Position = Position;
