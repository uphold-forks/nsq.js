'use strict';

/**
 * Module dependencies.
 */

const Backoff = require('backo');
const debug = require('debug')('nsq:reconnect');

/**
 * Exponential backoff reconnection mixin.
 *
 * @param {Connection} conn
 * @api private
 */

module.exports = (conn, max) => {
  const backoff = new Backoff({ min: 100, max: 10000, jitter: 200 });

  conn.on('ready', () => {
    debug('%s - reset backoff', conn.addr);
    backoff.reset();
  });

  conn.on('close', () => {
    if (conn.closing) {
      return;
    }

    debug('%s - socket closed', conn.addr);
    reconnect();
  });

  function reconnect() {
    if (backoff.attempts >= max) {
      return debug('%s - reconnection attempts exceeded', conn.addr);
    }

    const ms = backoff.duration();

    debug('%s - reconnection attempt (%s/%s) in %dms', conn.addr, backoff.attempts, max, ms);

    setTimeout(() => {
      conn.connect();
      conn.emit('reconnect', conn);
    }, ms);
  }
};
