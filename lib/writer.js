'use strict';

/**
 * Module dependencies.
 */

const { EventEmitter } = require('node:events');
const Connection = require('./connection');
const debug = require('debug')('nsq:writer');
const healthCheck = require('./mixins/health-check');
const reconnect = require('./mixins/reconnect');
const utils = require('./utils');

class Writer extends EventEmitter {
  /**
   * Constructor.
   *
   * @param {String|Object} options - can be either the nsqd address string or an object with the following options
   * @param {String[]} [options.nsqd] - nsqd addresses
   * @param {Number} [options.maxConnectionAttempts=Infinity] - max reconnection attempts
   * @param {Boolean} [options.healthCheck=false] - setup health check
   * @api public
   */

  constructor(options = {}) {
    super();

    // Coerce string option to an object option.
    if (typeof options === 'string') {
      options = { nsqd: [options] };
    }

    // Initialize properties.
    this.maxConnectionAttempts = options.maxConnectionAttempts ?? Infinity;
    this.nsqd = options.nsqd || [''];
    this.conns = new Set();
    this.healthCheck = options.healthCheck ?? false;
    this.pendingConns = new Set();
    this.publishQueue = [];

    // Add health check mixin.
    healthCheck(this);

    this.connect();
    this.n = 0;
  }

  /**
   * Publish `msg` to `topic`.
   *
   * @param {String} topic
   * @param {String|Buffer|Object|Array} msg
   * @param {Function} [fn]
   * @api public
   */

  publish(topic, msg, fn) {
    fn = fn || function() {};

    // JSON support.
    if (Array.isArray(msg)) {
      msg = msg.map(coerce);
    } else {
      msg = coerce(msg);
    }

    if (this.conns.size) {
      const conn = Array.from(this.conns)[this.n++ % this.conns.size];

      // Publish message.
      debug('%s - publish', conn.addr);

      if (Array.isArray(msg)) {
        conn.mpublish(topic, msg, fn);
      } else {
        conn.publish(topic, msg, fn);
      }
    } else {
      // Wait for ready and retry.
      this.publishQueue.push([topic, msg, fn]);
    }
  }

  /**
   * Establish connections to the given nsqd instances.
   *
   * @api private
   */

  connect() {
    for (const node of this.nsqd) {
      this.connectTo(node);
    }
  }

  /**
   * Connect to nsqd at `addr`.
   *
   * @param {String} address
   * @api private
   */

  connectTo(address) {
    debug('%s - connect', address);

    const opts = utils.parseAddress(address);
    const conn = new Connection(opts);

    this.pendingConns.add(conn);

    conn.on('close', () => {
      this.conns.delete(conn);

      if (!conn.closing) {
        this.pendingConns.add(conn);
      }

      debug('%s - remove from pool (total: %s)', address, this.conns.size);
    });

    conn.on('ready', () => {
      this.pendingConns.delete(conn);
      this.conns.add(conn);

      debug('%s - add to pool (total: %s)', address, this.conns.size);

      if (this.publishQueue.length > 0) {
        debug('draining messages from the publish queue (total: %s)', this.publishQueue.length);

        for (const [topic, msg, fn] of this.publishQueue) {
          this.publish(topic, msg, fn);
        }

        this.publishQueue = [];
      }
    });

    // TODO: poll
    // TODO: tests

    // Apply reconnection mixin.
    reconnect(conn, this.maxConnectionAttempts);

    // Apply event delegation.
    this.delegate(conn);

    // Connect to the nsqd node.
    conn.connect();
  }

  /**
   * Delegate events from `conn`.
   *
   * @param {Connection} conn
   * @api private
   */

  delegate(conn) {
    utils.delegate(conn, 'error response', this);
    utils.delegate(conn, 'error', this);
    utils.delegate(conn, 'connect', this);
    utils.delegate(conn, 'ready', this);
    utils.delegate(conn, 'end', this);
  }

  /**
   * Close the connections.
   *
   * @param {Function} fn
   * @api public
   */

  close(fn) {
    debug('close');

    if (fn) {
      this.once('close', fn);
    }

    this.pendingConns.forEach(conn => conn.destroy());

    let n = this.conns.size;

    if (n === 0) {
      this.emit('close');
    }

    this.conns.forEach(conn => {
      conn.end(() => {
        debug('%s - conn ended', conn.addr);

        if (--n === 0) {
          this.emit('close');
        }
      });
    });
  }
}

/**
 * Coerce `val`.
 *
 * @param {String|Object} val
 * @returns {String}
 */

function coerce(val) {
  if (val && typeof val === 'object' && !Buffer.isBuffer(val)) {
    return JSON.stringify(val);
  }

  return val;
}

/**
 * Expose `Writer`.
 */

module.exports = Writer;
