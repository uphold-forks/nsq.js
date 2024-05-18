'use strict';

/**
 * Module dependencies.
 */

const Reader = require('./lib/reader');
const Writer = require('./lib/writer');

/**
 * Create a new reader.
 *
 * @param {object} options Reader options.
 * @returns {Reader} NSQ reader.
 * @public
 */

module.exports.reader = options => new Reader(options);

/**
 * Create a new writer.
 *
 * @param {object} options Writer options.
 * @returns {Writer} NSQ writer.
 * @public
 */

module.exports.writer = options => new Writer(options);
