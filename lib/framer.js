'use strict';

/**
 * Module dependencies.
 */

const { EventEmitter } = require('node:events');
const debug = require('debug')('nsq:framer');

/**
 * Initialize a new framer.
 *
 *   |  (int32) ||  (int32) || (binary)
 *   |  4-byte  ||  4-byte  || N-byte
 *   ------------------------------------...
 *       size     frame type     data
 *
 * @api private
 */

class Framer extends EventEmitter {
  buffer = null;

  /**
   * Stores data `buffers` and parses them to emit message frames.
   *
   * @param {Buffer} buffer
   * @api private
   */

  write(buffer) {
    debug('write: %d bytes', buffer.length);
    buffer = this.buffer ? Buffer.concat([this.buffer, buffer]) : buffer;

    let offset = 0;

    for (const { next, ...frame } of parseFrames(buffer)) {
      offset = next;

      this.emit('frame', frame);
    }

    // If the buffer is not empty, store the unparsed data for future use.
    this.buffer = buffer.length > offset ? buffer.subarray(offset) : null;
  }
}

/**
 * Parses frames from the buffer.
 *
 * @param {Buffer} buffer
 * @api private
 */

function *parseFrames(buffer) {
  let offset = 0;

  while (true) {
    // Header not in the buffer, stop the parsing.
    if (offset + 8 > buffer.length) {
      break;
    }

    // Get size and type from frame.
    const size = buffer.readInt32BE(offset) - 4;
    const type = buffer.readInt32BE(offset + 4);

    debug('size=%d type=%d', size, type);

    offset += 8;

    const end = offset + size;

    // Frame not in the buffer, stop the parsing.
    if (end > buffer.length) {
      break;
    }

    yield {
      body: buffer.subarray(offset, end),
      type: type,
      next: end
    };

    offset = end;
  }
}

/**
 * Expose `Framer`.
 */

module.exports = Framer;
