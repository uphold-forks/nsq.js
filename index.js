'use strict';

/**
 * Module dependencies.
 */

const Reader = require('./lib/reader');
const Writer = require('./lib/writer');

/**
 * Create a new reader.
 *
 * @param {Object} options
 * @return {Writer}
 * @api public
 */

module.exports.reader = options => new Reader(options);

/**
 * Create a new writer.
 *
 * @param {Object} options
 * @return {Writer}
 * @api public
 */

module.exports.writer = options => new Writer(options);
