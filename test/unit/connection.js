'use strict';

/**
 * Module dependencies.
 */

const { framerData } = require('../utils');
const Connection = require('../../lib/connection');
const assert = require('node:assert');

describe('Connection', () => {
  describe('constructor()', () => {
    it('should default maxAttempts to Infinity', () => {
      const conn = new Connection();

      assert.equal(conn.maxAttempts, Infinity);
    });

    it('should default maxInFlight to 1', () => {
      const conn = new Connection();

      assert.equal(conn.maxInFlight, 1);
    });

    it('should populate `addr`', () => {
      const conn = new Connection({ host: '0.0.0.0', port: 1234 });

      assert.equal(conn.addr, '0.0.0.0:1234');
    });
  });

  describe('command()', () => {
    it('should write command', () => {
      const conn = new Connection();
      const writes = [];

      conn.sock = {
        write: chunks => {
          writes.push(chunks);
        }
      };

      conn.command('NOP');

      assert.equal(writes.toString(), 'NOP \n');
    });

    it('should write command and args', () => {
      const conn = new Connection();
      const writes = [];

      conn.sock = { write: chunks => writes.push(chunks) };

      conn.command('RDY', [5]);

      assert.equal(writes.toString(), 'RDY 5\n');
    });

    it('should write command, args and data', () => {
      const conn = new Connection();
      const writes = [];

      conn.sock = { write: chunks => writes.push(chunks) };

      conn.command('PUB', ['events'], Buffer.from('foo bar'));

      assert.equal(writes.toString(), 'PUB events\n\u0000\u0000\u0000\u0007foo bar');
    });

    it('should join multiple args', () => {
      const conn = new Connection();
      const writes = [];

      conn.sock = { write: chunks => writes.push(chunks) };

      conn.command('REQ', ['12345', 5000]);

      assert.equal(writes.toString(), 'REQ 12345 5000\n');
    });

    it('should call callbacks with error when connection is closed', done => {
      const conn = new Connection();

      conn.on('ready', () => {
        conn.sock.write = () => {
          // trigger a socket 'close' event.
          conn.sock.end();
        };

        conn.command('PUB', ['events'], Buffer.from('foo bar'), err => {
          assert.equal(err.message, 'socket closed without releasing callbacks');
          assert.equal(conn.callbacks.length, 0);

          done();
        });
      });

      conn.connect();
    });
  });

  describe('connect()', () => {
    it('should emit message if maxAttempts and attempts is 1', (done) => {
      const conn = new Connection({ maxAttempts: 1 });

      conn.on('ready', () => {
        // ignore 'invalid state' error due to not having callbacks.
        conn.on('error', function() {});

        conn.on('discard', () => {
          throw new Error('discard should not be called');
        });

        conn.on('message', msg => {
          assert.equal(msg.attempts, 1);
          done();
        });

        framerData.forEach(data => conn.framer.write(Buffer.from(data, 'hex')));
      });

      conn.connect();
    });
  });

  describe('subscribe()', () => {
    it('should call `Connection.command()`', done => {
      const conn = new Connection();

      conn._ready = true;

      conn.command = (cmd, args, fn) => {
        assert.equal(cmd, 'SUB');
        assert.deepEqual(args, ['events', 'ingestion']);

        fn();
      };

      conn.subscribe('events', 'ingestion', done);
    });
  });

  describe('publish()', () => {
    it('should call `Connection.command()`', done => {
      const conn = new Connection();

      conn._ready = true;

      conn.command = (cmd, args, data, fn) => {
        assert.equal(cmd, 'PUB');
        assert.deepEqual(args, ['events']);
        assert.equal(data, 'foo bar baz');

        fn();
      };

      conn.publish('events', 'foo bar baz', done);
    });
  });

  describe('ready()', () => {
    it('should call `Connection.command()`', done => {
      const conn = new Connection();

      conn.command = (cmd, args) => {
        assert.equal(cmd, 'RDY');
        assert.equal(args[0], 15);

        done();
      };

      conn.ready(15);

      assert.equal(conn.lastReady, 15);
    });
  });
});
