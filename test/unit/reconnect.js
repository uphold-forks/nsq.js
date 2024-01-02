'use strict';

/**
 * Module dependencies.
 */

const { EventEmitter } = require('node:events');
const assert = require('node:assert');
const reconnect = require('../../lib/mixins/reconnect');

describe('reconnect()', () => {
  it('should emit "reconnect"', done => {
    const conn = new EventEmitter();
    let called = false;

    conn.connect = () => {
      called = true;
    };

    reconnect(conn);

    conn.emit('connect');
    conn.emit('close');

    conn.on('reconnect', c => {
      assert.equal(called, true);
      assert.deepEqual(c, conn);
      done();
    });

    conn.emit('connect');
  });

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
});
