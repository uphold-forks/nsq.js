'use strict';

/**
 * Module dependencies.
 */

const debug = require('debug')('nsq:ready');

/**
 * RDY handling mixin.
 *
 * @param {Connection} conn
 * @api private
 */

module.exports = conn => {
  let closing = false;
  let paused = false;
  let inflight;

  conn.on('ready', () => {
    inflight = conn.maxInFlight;
  });

  conn.on('closing', () => {
    closing = true;
  });

  conn.on('pause', () => {
    paused = true;
  });

  conn.on('resume', () => {
    paused = false;

    check();
  });

  conn.on('finish', check);
  conn.on('requeue', check);

  function check() {
    inflight--;

    if (paused || closing) {
      return;
    }

    if (inflight <= Math.ceil(conn.maxInFlight * .2)) {
      ready();
    }
  }

  function ready() {
    debug('%s - RDY %s', conn.addr, conn.maxInFlight);
    conn.ready(conn.maxInFlight);

    inflight = conn.maxInFlight;
  }
};
