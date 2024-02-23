'use strict';

/**
 * Module dependencies.
 */

const assert = require('node:assert');
const Reader = require('../../lib/reader');
const Writer = require('../../lib/writer');
const sinon = require('sinon');
const uid = require('uid');
const utils = require('../utils');

describe('Acceptance: Reader', () => {
  let topic;

  afterEach(done => {
    utils.deleteTopic(topic, () => done());
  });

  beforeEach(() => {
    topic = uid();
  });

  describe('Reader', () => {
    describe('constructor()', () => {
      describe('with nsqd addresses', () => {
        it('should subscribe to messages', done => {
          const pub = new Writer();
          const sub = new Reader({
            topic,
            channel: 'reader',
            nsqd: ['127.0.0.1:4150']
          });

          sub.on('message', msg => msg.finish(done));
          pub.on('ready', () => pub.publish(topic, 'something', done));
        });

        it('should connect after event handlers are added', done => {
          const sub = new Reader({
            topic,
            channel: 'reader',
            nsqd: ['127.0.0.1:4150']
          });

          sub.connect = () => sub.emit('done');

          sub.on('done', done);
        });
      });

      describe('with nsqlookupd addresses', () => {
        it('should subscribe to messages', done => {
          const pub = new Writer();
          const sub = new Reader({
            topic,
            channel: 'reader',
            nsqlookupd: ['127.0.0.1:4161'],
            pollInterval: 100
          });

          sub.on('message', msg => msg.finish(done));
          pub.on('ready', () => pub.publish(topic, 'something', done));
        });

        it('should connect after event handlers are added', done => {
          const sub = new Reader({
            topic,
            channel: 'reader',
            nsqlookupd: ['127.0.0.1:4161']
          });

          sub.connect = () => sub.emit('done');

          sub.on('done', done);
        });

        it('should set timer attribute for lookup polling', done => {
          const sub = new Reader({
            topic,
            channel: 'reader',
            nsqlookupd: ['127.0.0.1:4161']
          });

          setImmediate(() => {
            assert.ok(sub.timer);
            done();
          });
        });
      });

      it('should discard messages after the max attempts', done => {
        const pub = new Writer();
        const sub = new Reader({
          topic,
          channel: 'reader',
          nsqd: ['127.0.0.1:4150'],
          maxAttempts: 2,
        });

        let attempts = 0;

        sub.once('discard', () => {
          sub.removeAllListeners('message');

          assert.equal(attempts, 2);

          done();
        });

        sub.on('message', msg => {
          attempts++;
          msg.requeue(0);
        });
        pub.on('ready', () => pub.publish(topic, 'something'));
      });

      it('should re-receive the message after calling requeue', done => {
        const pub = new Writer();
        const sub = new Reader({
          topic,
          channel: 'reader',
          nsqd: ['127.0.0.1:4150'],
          maxAttempts: 2,
        });

        let attempts = 1;

        sub.on('message', msg => {
          assert.equal(msg.attempts, attempts);

          if (msg.attempts === 1) {
            msg.requeue(0, err => assert.ifError(err));
          } else {
            msg.finish(done);
          }

          attempts++;
        });
        pub.on('ready', () => pub.publish(topic, 'something'));
      });
    });

    describe('close()', () => {
      beforeEach(done => {
        utils.createTopic(topic, done);
      });

      it('should wait for in-flight messages and emit "close"', done => {
        const pub = new Writer();
        const sub = new Reader({
          topic,
          channel: 'reader',
          nsqd: ['127.0.0.1:4150'],
          maxInFlight: 10
        });

        let recv = 0;
        let sent = 0;

        pub.on('ready', () => {
          for (let count = 30; count > 0; count--) {
            pub.publish(topic, { n: sent++ });
          }
        });
        sub.on('close', () => {
          assert.equal(sent, 30);
          assert.ok(recv <= 20, 'received too many messages');
          done();
        });
        sub.on('message', msg => {
          if (recv++ === 10) {
            sub.close();
          }

          msg.finish();
        });
      });

      it('should wait for pending messages and invoke the callback', done => {
        const pub = new Writer();
        const sub = new Reader({
          topic,
          channel: 'reader',
          nsqd: ['127.0.0.1:4150'],
          maxInFlight: 10
        });

        let recv = 0;
        let sent = 0;

        pub.on('ready', () => {
          for (let count = 30; count > 0; count--) {
            pub.publish(topic, { n: sent++ });
          }
        });
        sub.on('message', msg => {
          if (recv++ == 10) {
            sub.close(() => {
              assert.equal(sent, 30);
              assert.ok(recv <= 20, 'received too many messages');

              done();
            });
          }

          msg.finish();
        });
      });

      it('should close if there are no in-flight messages', done => {
        const sub = new Reader({
          topic,
          channel: 'reader',
          nsqd: ['127.0.0.1:4150'],
          maxInFlight: 10
        });

        sub.on('subscribed', () => sub.close(done));
      });

      it('should stop polling nsqlookupd if reader had been closed', done => {
        const sub = new Reader({
          topic,
          channel: 'reader',
          nsqlookupd: ['127.0.0.1:4161'],
          pollInterval: 10
        });

        setImmediate(() => {
          sub.close();
          sub.lookup = () => {
            done(new Error('setInterval() is still running'));
          };
        });

        setTimeout(done, 100);
      });
    });

    describe('end()', () => {
      it('should end if there are no connections', done => {
        const sub = new Reader({
          topic,
          channel: 'reader',
          nsqd: [],
        });

        sub.end(done);
      });

      it('should end all connections', done => {
        const sub = new Reader({
          topic,
          channel: 'reader',
          nsqd: ['127.0.0.1:4150']
        });

        sub.on('subscribed', () => {
          sub.end(() => {
            sub.conns.forEach(conn => assert.equal(conn.closed, true));

            done();
          });
        });
      });

      it('should end all connections even if there are in-flight messages', done => {
        const pub = new Writer();

        const sub = new Reader({
          topic,
          channel: 'reader',
          nsqd: ['127.0.0.1:4150'],
          maxInFlight: 10
        });

        pub.on('ready', () => {
          pub.publish(topic, {});
        });

        sub.on('message', () => {
          sub.end(() => {
            let pending = 0;

            sub.conns.forEach(conn => {
              pending += conn.inFlight;
            });

            assert.equal(pending, 1);

            done();
          });
        });
      });

      it('should stop polling nsqlookupd if reader had been ended', done => {
        const sub = new Reader({
          topic,
          channel: 'reader',
          nsqlookupd: ['127.0.0.1:4161'],
          pollInterval: 10
        });

        setImmediate(() => {
          sub.close();
          sub.lookup = () => {
            done(new Error('setInterval() is still running'));
          };
        });

        setTimeout(done, 100);
      });
    });

    describe('reader lifecycle', () => {
      beforeEach(done => {
        utils.createTopic(topic, done);
      });

      it('should remove connections that disconnect', done => {
        const sub = new Reader({
          topic,
          channel: 'reader',
          nsqd: ['127.0.0.1:4150'],
          maxConnectionAttempts: 0
        });

        sub.on('subscribed', () => {
          assert.equal(sub.conns.size, 1);

          sub.conns.forEach(conn => {
            conn.on('disconnect', () => {
              assert.equal(sub.conns.size, 0);

              done();
            });

            conn.sock.end();
          });
        });
      });

      it('should emit lookup errors', done => {
        const sub = new Reader({
          topic,
          channel: 'reader',
          nsqlookupd: ['127.0.0.1:4161'],
          pollInterval: 10
        });

        sinon.stub(sub, 'lookup').onSecondCall().callsFake(fn => {
          fn([new Error('foo')]);
        });

        sub.on('error lookup', error => {
          assert.equal(error.message, 'foo');

          done();
        });

      });
    });
  });
});
