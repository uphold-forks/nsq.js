'use strict';

/**
 * Module dependencies.
 */

const { framerData } = require('../utils');
const Framer = require('../../lib/framer');
const Message = require('../../lib/message');
const assert = require('node:assert');

describe('Framer', () => {
  it('should emit frames', done => {
    const framer = new Framer();

    let n = 0;

    framer.on('frame', frame => {
      switch (n++) {
        case 0: {
          assert.equal(frame.type, 0);
          assert.equal(frame.body.toString(), JSON.stringify({
            max_rdy_count: 2500,
            version: '0.2.24',
            max_msg_timeout: 900000,
            msg_timeout: 60000,
            tls_v1: false,
            deflate: false,
            deflate_level: 0,
            max_deflate_level: 6,
            snappy: false
          }));

          break;
        }
        case 1: {
          assert.equal(frame.type, 0);
          assert.equal(frame.body.toString(), 'OK');

          break;
        }
        case 2: {
          const msg = new Message(frame.body, { features: {} });

          assert.equal(frame.type, 2);
          assert.equal(msg.id, '062625401f65f008');
          assert.equal(msg.attempts, 1);
          assert.equal(msg.timestamp.toString(), '1394474113503292997');
          assert.equal(msg.body.toString(), 'some message here');

          done();

          break;
        }
      }
    });

    framerData.forEach(data => framer.write(Buffer.from(data, 'hex')));
  });
});
