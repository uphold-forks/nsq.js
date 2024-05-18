'use strict';

/**
 * Module dependencies.
 */

const Connection = require('../../lib/connection');
const assert = require('node:assert');
const nsq = require('../..');
const sinon = require('sinon');
const uid = require('uid');
const utils = require('../utils');

describe('Acceptance: Writer', () => {
  let topic;

  afterEach(done => {
    utils.deleteTopic(topic, () => done());
  });

  beforeEach(() => {
    topic = uid();
  });

  describe('Writer', () => {
    describe('publish()', () => {
      it('should publish messages', done => {
        const pub = nsq.writer();
        const sub = new Connection();

        pub.publish(topic, 'something');

        sub.on('ready', () => {
          sub.subscribe(topic, 'tailer');
          sub.ready(5);
        });

        sub.on('message', msg => {
          msg.finish();
          done();
        });

        sub.connect();
      });

      it('should emit "error"', done => {
        const pub = nsq.writer({ maxConnectionAttempts: 0, nsqd: ['0.0.0.0:5000'] });

        pub.on('error', err => {
          assert.equal(err.code, 'ECONNREFUSED');
          assert.equal(err.address, '0.0.0.0:5000');
          done();
        });
      });

      it('should close with an optional callback', done => {
        const pub = nsq.writer();
        const sub = new Connection();
        let n = 0;

        function next(err) {
          if (err) {
            return done(err);
          }

          n++;
        }

        pub.on('ready', () => {
          pub.publish(topic, new Buffer.alloc(1024), next);
          pub.publish(topic, new Buffer.alloc(1024), next);
          pub.publish(topic, new Buffer.alloc(1024), next);
          pub.close(() => {
            assert(n === 3);
            done();
          });
        });

        sub.on('ready', () => sub.subscribe(topic, 'tailer'));

        sub.on('message', msg => msg.finish());

        sub.connect();
      });

      it('should call close callback and destroy pending connections when there are no ready connections', done => {
        sinon.spy(Connection.prototype, 'destroy');
        sinon.spy(Connection.prototype, 'close');

        const pub = nsq.writer();

        pub.close(() => {
          assert.equal(Connection.prototype.destroy.called, true);
          assert.equal(Connection.prototype.close.called, false);

          done();
        });
      });

      describe('with an array', () => {
        it('should MPUT', done => {
          const pub = nsq.writer();
          const sub = new Connection();
          const msgs = [];

          let n = 0;

          pub.on('ready', () => pub.publish(topic, ['foo', 'bar', 'baz']));

          sub.on('ready', () => {
            sub.subscribe(topic, 'something');
            sub.ready(5);
          });

          sub.on('message', msg => {
            msgs.push(msg.body.toString());
            msg.finish();

            if (++n === 3) {
              assert.deepEqual(msgs, ['foo', 'bar', 'baz']);
              done();
            }
          });

          sub.connect();
        });
      });

      describe('with a buffer', () => {
        it('should not stringify', done => {
          const pub = nsq.writer();
          const sub = new Connection();

          pub.on('ready', () => pub.publish(topic, Buffer.from('foobar')));

          sub.on('ready', () => {
            sub.subscribe(topic, 'something');
            sub.ready(5);
          });

          sub.on('message', msg => {
            msg.finish();
            assert.equal(msg.body.toString(), 'foobar');
            done();
          });

          sub.connect();
        });
      });
    });
  });
});
