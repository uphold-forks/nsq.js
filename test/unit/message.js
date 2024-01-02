'use strict';

/**
 * Module dependencies.
 */

const Message = require('../../lib/message');
const assert = require('node:assert');

/**
 * Buffer body for test messages.
 */

const body = Buffer.from('135a2ad167d76e45000130363236323534303166363566303038736f6d65206d6573736167652068657265', 'hex');

describe('Message', () => {
  describe('constructor()', () => {
    it('should parse the message', () => {
      const msg = new Message(body, { features: {} });

      assert.equal(msg.attempts, 1);
      assert.equal(msg.timestamp.toString(), '1394474113503292997');
      assert.equal(msg.body.toString(), 'some message here');
    });
  });

  describe('inspect()', () => {
    it('should return a value for use with inspect', () => {
      const msg = new Message(body, { features: {} });

      assert.equal(msg.inspect(), '<Message 062625401f65f008 attempts=1 size=17>');
    });
  });

  describe('json()', () => {
    it('should return the message body parsed as an object', () => {
      const msg = new Message(body, { features: {} });

      msg.body = Buffer.from('{"foo":"bar"}');

      // TODO.
      assert.deepEqual(msg.json(), { foo: 'bar' });
    });
  });

  describe('finish()', () => {
    it('should call `connection.finish()`', done => {
      const conn = {
        features: {},
        finish: id => {
          assert.equal(id, '062625401f65f008');

          done();
        }
      };

      const msg = new Message(body, conn);

      assert.equal(msg.responded, false);

      msg.finish();

      assert.equal(msg.responded, true);
    });
  });

  describe('touch()', () => {
    it('should call `connection.touch()`', done => {
      const conn = {
        features: {},
        touch: id => {
          assert.equal(id, '062625401f65f008');

          done();
        }
      };

      const msg = new Message(body, conn);

      assert.equal(msg.responded, false);

      msg.touch();

      assert.equal(msg.responded, false);
    });

    it('should update `message.lastTouch`', done => {
      const conn = {
        features: {},
        touch: id => {
          assert.equal(id, '062625401f65f008');
        }
      };
      const msg = new Message(body, conn);
      const prev = msg.lastTouch;

      setTimeout(() => {
        msg.touch();

        assert.notEqual(msg.lastTouch, prev);

        done();
      }, 5);
    });
  });

  describe('requeue()', () => {
    it('should call `connection.requeue()`', done => {
      const conn = {
        features: {},
        requeue: (id, delay) => {
          assert.equal(id, '062625401f65f008');
          assert.equal(delay, null);

          done();
        }
      };

      const msg = new Message(body, conn);

      assert.equal(msg.responded, false);

      msg.requeue();

      assert.equal(msg.responded, true);
    });

    it('should call `connection.requeue()` with delay', done => {
      const conn = {
        features: {},
        requeue: (id, delay) => {
          assert.equal(id, '062625401f65f008');
          assert.equal(delay, 5000);

          done();
        }
      };

      const msg = new Message(body, conn);

      assert.equal(msg.responded, false);

      msg.requeue(5000);

      assert.equal(msg.responded, true);
    });
  });

  describe('timeUntilTimeout()', () => {
    it('should return the time until timeout', () => {
      const conn = {
        features: {
          msg_timeout: 5000
        }
      };

      const msg = new Message(body, conn);

      assert.ok(msg.timeUntilTimeout() > 0);
      assert.ok(msg.timeUntilTimeout() <= 5000);
    });
  });

  describe('timedout()', () => {
    it('should return false if the message has not timed out', () => {
      const conn = {
        features: {
          msg_timeout: 5000
        }
      };

      const msg = new Message(body, conn);

      assert.equal(msg.timedout(), false);
    });

    it('should return true if the message has timed out', done => {
      const conn = {
        features: {
          msg_timeout: 1
        }
      };

      const msg = new Message(body, conn);

      setTimeout(() => {
        assert.equal(msg.timedout(), true);

        done();
      }, 2);
    });
  });
});
