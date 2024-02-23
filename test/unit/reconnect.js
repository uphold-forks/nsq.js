'use strict';

/**
 * Module dependencies.
 */

const { EventEmitter } = require('node:events');
const assert = require('node:assert');
const reconnect = require('../../lib/mixins/reconnect');

describe('reconnect()', () => {
  it('should reconnect on close', done => {
    const conn = new EventEmitter();

    conn.connect = done;

    reconnect(conn);
    conn.emit('close');
  });

  it('should not reconnect on close if `closing` is true', done => {
    const conn = new EventEmitter();

    conn.connect = () => {
      assert.fail('should not call .connect()');
    };

    conn.closing = true;

    reconnect(conn);
    conn.emit('close');

    process.nextTick(done);
  });

  it('should emit "disconnect" if the max number of reconnection attempts is reached', done => {
    const conn = new EventEmitter();

    conn.connect = () => {};

    reconnect(conn, 1);

    conn.on('disconnect', done);

    conn.emit('close');
    conn.emit('close');
  });
});
