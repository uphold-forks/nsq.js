'use strict';

/**
 * Module dependencies.
 *
 * @typedef {import('../connection')} Connection
 */

const ms = require('ms');

/**
 * Initializes a new message with the given `body`.
 *
 * | nanosecond timestamp | attempts | message ID | message body |
 * | :------------------: | :------: | :--------: | :----------: |
 * | [x][x][x][x][x][x][x][x][x] | [x][x] | [x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x] | [x][x][x][x] |
 * | 8-byte               | 2-byte   | 16-byte    | N-byte       |
 * | int64                | uint16   | hex        | binary       |
 */

class Message {
  /**
   * Constructor.
   *
   * @param {Buffer} body - Message body.
   * @param {Connection} conn - Connection instance.
   * @class
   * @private
   */

  constructor(body, conn) {
    this.conn = conn;
    this.lastTouch = Date.now();
    this.msgTimeout = conn.features.msg_timeout;
    this.responded = false;
    this.trace = conn.trace || function () {};

    this.parse(body);
  }

  /**
   * Marks the message as finished.
   *
   * @param {Function} [fn] - Callback.
   * @public
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
   * @returns {number} Remaining time in milliseconds.
   * @public
   */

  timeUntilTimeout() {
    return Math.max(this.lastTouch + this.msgTimeout - Date.now(), 0);
  }

  /**
   * Checks if the in-flight message has timed out.
   *
   * @returns {boolean} Whether the message has timed out.
   * @public
   */

  timedout() {
    return this.timeUntilTimeout() === 0;
  }

  /**
   * Requeues the message with optional `delay`.
   *
   * @param {number | string} [delay] - Delay in milliseconds or a string like '2s'.
   * @param {Function} [fn] - Callback.
   * @public
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
   * @param {Function} [fn] - Callback.
   * @public
   */

  touch(fn) {
    this.lastTouch = Date.now();

    this.conn.touch(this.id, fn);
    this.trace('message:touch', { msg: this });
  }

  /**
   * Returns the parsed message body.
   *
   * @returns {object} Parsed message body.
   * @public
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
   * @param {Buffer} buffer - Message buffer.
   * @private
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
   * @public
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
   * @returns {string} Inspect output.
   * @public
   */

  inspect() {
    return `<Message ${this.id} attempts=${this.attempts} size=${this.body.length}>`;
  }
}

/**
 * Expose `Message`.
 */

module.exports = Message;
