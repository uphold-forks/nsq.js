'use strict';

/**
 * Module dependencies.
 *
 * @typedef {import('../connection')} Connection
 */

const Backoff = require('backo');
const debug = require('debug')('nsq:reconnect');

/**
 * Exponential backoff reconnection mixin.
 *
 * @param {Connection} conn - Connection instance.
 * @mixin
 * @private
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

  /**
   * Reconnect to the `nsqd` node.
   *
   * @function reconnect
   */

  function reconnect() {
    if (backoff.attempts >= max) {
      debug('%s - reconnection attempts exceeded', conn.addr);

      conn.emit('disconnect');

      return;
    }

    const ms = backoff.duration();

    debug('%s - reconnection attempt (%s/%s) in %dms', conn.addr, backoff.attempts, max, ms);

    setTimeout(() => conn.connect(), ms);
  }
};
