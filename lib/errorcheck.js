/**
 * Specific JSLint errors checker.
 */

var program = require('commander');
var _ = require('underscore');


/**
 * Different rules to check.
 * @enum {string}
 */
var Rule = {
    // Documentations for specific rules goes in flag definition.
    BLANK_LINES_AT_TOP_LEVEL: 'blank_lines_at_top_level',
    INDENTATION: 'indentation',
    WELL_FORMED_AUTHOR: 'well_formed_author',
    NO_BRACES_AROUND_INHERIT_DOC: 'no_braces_around_inherit_doc',
    BRACES_AROUND_TYPE: 'braces_around_type',
    OPTIONAL_TYPE_MARKER: 'optional_type_marker',
    VARIABLE_ARG_MARKER: 'variable_arg_marker',
    UNUSED_PRIVATE_MEMBERS: 'unused_private_members',
    UNUSED_LOCAL_VARIABLES: 'unused_local_variables',

    // Rule to raise all known errors.
    ALL: 'all'};


// All rules that are to be checked when using the strict flag. E.g. the
// rules that are specific to the stricter Closure style.
Rule.CLOSURE_RULES = [
        Rule.BLANK_LINES_AT_TOP_LEVEL,
        Rule.INDENTATION,
        Rule.WELL_FORMED_AUTHOR,
        Rule.NO_BRACES_AROUND_INHERIT_DOC,
        Rule.BRACES_AROUND_TYPE,
        Rule.OPTIONAL_TYPE_MARKER,
        Rule.VARIABLE_ARG_MARKER];


/**
 * Returns whether the optional rule should be checked.
 *
 * Computes different flags (strict, jslint_error, jslint_noerror) to find out
 * if this specific rule should be checked.
 * @param {Rule} rule Name of the rule (see Rule).
 * @return {boolean} True if the rule should be checked according to the flags,
 *      otherwise False.
 */
var shouldCheck = function(rule) {
    if (_.contains(program.jslint_error, rule) ||
            _.contains(program.jslint_error, Rule.ALL)) {
        return true;
    }

    return program.strict && _.contains(Rule.CLOSURE_RULES, rule);
};


exports.Rule = Rule;
exports.shouldCheck = shouldCheck;
