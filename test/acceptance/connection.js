'use strict';

/**
 * Module dependencies.
 */

const Connection = require('../../lib/connection');
const assert = require('node:assert');
const uid = require('uid');
const utils = require('../utils');

describe('Acceptance: Connection', () => {
  let topic;

  afterEach(done => {
    utils.deleteTopic(topic, () => done());
  });

  beforeEach(() => {
    topic = uid();
  });

  it('should identify on connect', done => {
    const conn = new Connection();

    conn.on('ready', () => {
      assert('version' in conn.features);
      assert('max_rdy_count' in conn.features);
      assert('msg_timeout' in conn.features);
      done();
    });

    conn.connect();
  });

  it('should emit and receive messages', done => {
    const pub = new Connection();
    const sub = new Connection();

    pub.on('ready', () => pub.publish(topic, 'something'));

    sub.on('ready', () => {
      sub.subscribe(topic, 'tailer');
      sub.ready(5);
    });

    sub.on('message', (msg) => {
      msg.finish();
      done();
    });

    pub.connect();
    sub.connect();
  });

  it('should close cleanly', done => {
    const conn = new Connection();

    conn.on('ready', () => {
      conn.subscribe(topic, 'tailer', err => {
        assert.ifError(err);
        conn.close(done);
      });
    });

    conn.connect();
  });

  it('should only call callbacks a single time', done => {
    const conn = new Connection();

    let called = 0;

    conn.on('error', () => {});
    conn.on('ready', () => {
      conn.sock.destroy();

      setTimeout(() => {
        conn.publish(topic, 'something', () => called++);
        assert.equal(called, 1);
        done();
      }, 0);
    });

    conn.connect();
  });

  it('should not emit socket errors after destroy', done => {
    const conn = new Connection();

    conn.on('error', done);
    conn.on('ready', () => {
      conn.destroy();
      conn.sock.emit('error', new Error());
      done();
    });

    conn.connect();
  });

  it('should not write after socket.end()', done => {
    const conn = new Connection();

    conn.on('ready', () => {
      conn.end();
      conn.publish(topic, 'stuff');
      conn.on('error', done);
      conn.on('end', done);
    });

    conn.connect();
  });
});
