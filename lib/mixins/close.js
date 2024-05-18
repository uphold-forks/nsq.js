'use strict';

/**
 * Module dependencies.
 *
 * @typedef {import('../reader')} Reader
 */

const debug = require('debug')('nsq:close');

/**
 * Graceful close mixin.
 *
 * @param {Reader} reader - Reader instance.
 * @mixin
 * @private
 */

module.exports = reader => {
  let pending = 0;

  /**
   * Decrement pending counter.
   *
   * @function decr
   */

  function decr() {
    pending--;

    check();
  }

  /**
   * Check if all pending messages have been processed.
   *
   * @function check
   */

  function check() {
    debug('pending %d', pending);

    if (pending) {
      return;
    }

    reader.end();
  }

  reader.once('closing', () => {
    debug('closing');

    reader.conns.forEach(conn => {
      pending += conn.inFlight;

      conn.on('requeue', decr);
      conn.on('finish', decr);
    });

    if (!pending) {
      process.nextTick(check);
    }
  });
};
