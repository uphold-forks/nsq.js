'use strict';

/**
 * Module dependencies.
 */

const debug = require('debug')('nsq:close');

/**
 * Graceful close mixin.
 *
 * @param {Reader} reader
 * @api private
 */

module.exports = reader => {
  let pending = 0;

  function decr() {
    pending--;

    check();
  }

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
