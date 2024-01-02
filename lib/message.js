'use strict';

/**
 * Module dependencies.
 */

const ms = require('ms');

/**
 * Initializes a new message with the given `body`.
 *
 *    [x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x]...
 *    |       (int64)        ||    ||      (hex string encoded in ASCII)           || (binary)
 *    |       8-byte         ||    ||                 16-byte                      || N-byte
 *    ------------------------------------------------------------------------------------------...
 *      nanosecond timestamp    ^^                   message ID                       message body
 *                           (uint16)
 *                            2-byte
 *                           attempts
 */

class Message {
  /**
   * Constructor.
   *
   * @param {Buffer} body
   * @param {Connection} conn
   * @api private
   */

  constructor(body, conn) {
    this.conn = conn;
    this.lastTouch = Date.now();
    this.msgTimeout = conn.features.msg_timeout;
    this.responded = false;
    this.trace = conn.trace || function() {};

    this.parse(body);
  }

  /**
   * Marks the message as finished.
   *
   * @param {Function} [fn]
   * @api public
   */

  finish(fn) {
    this.responded = true;

    this.conn.finish(this.id, fn);
    this.trace('message:finish', { msg: this });
  }

  /**
   * Returns the amount of time in milliseconds until
   * the message will timeout and requeue.
   *
   * @return {Number}
   * @api public
   */

  timeUntilTimeout() {
    return Math.max(this.lastTouch + this.msgTimeout - Date.now(), 0);
  }

  /**
   * Checks if the in-flight message has timed out.
   *
   * @return {Boolean}
   * @api public
   */

  timedout() {
    return this.timeUntilTimeout() === 0;
  }

  /**
   * Requeues the message with optional `delay`.
   *
   * @param {Number|String} [delay]
   * @param {Function} [fn]
   * @api public
   */

  requeue(delay, fn) {
    if (typeof delay === 'string') {
      delay = ms(delay);
    }

    this.responded = true;

    this.conn.requeue(this.id, delay, fn);
    this.trace('message:requeue', { msg: this });
  }

  /**
   * Sends a message heartbeat to the server so it won't timeout and requeue.
   *
   * @param {Function} [fn]
   * @api public
   */

  touch(fn) {
    this.lastTouch = Date.now();

    this.conn.touch(this.id, fn);
    this.trace('message:touch', { msg: this });
  }

  /**
   * Returns the parsed message body.
   *
   * @return {Object}
   * @api public
   */

  json() {
    if (!this._json) {
      this._json = JSON.parse(this.body.toString());
    }

    return this._json;
  }

  /**
   * Parses the message buffer and assigns message properties.
   *
   * @param {Buffer} buffer
   * @api private
   */

  parse(buffer) {
    // First 8 bytes is the timestamp.
    this.timestamp = buffer.readBigUInt64BE(0);

    // The next 2 bytes is the number of attempts.
    this.attempts = buffer.readInt16BE(8);

    // The next 16 bytes is the message id.
    this.id = buffer.subarray(10, 26).toString();

    // The remaining bytes are the message body.
    this.body = buffer.subarray(26, buffer.length);
  }

  /**
   * JSON implementation.
   *
   * @api public
   */

  toJSON() {
    return {
      id: this.id,
      attempts: this.attempts,
      timestamp: this.timestamp.toString(10),
      msgTimeout: this.msgTimeout
    };
  }

  /**
   * Inspect implementation.
   *
   * @return {String}
   * @api public
   */

  inspect() {
    return `<Message ${this.id} attempts=${this.attempts} size=${this.body.length}>`;
  }
}

/**
 * Expose `Message`.
 */

module.exports = Message;
