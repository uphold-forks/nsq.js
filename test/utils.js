'use strict';

/**
 * Module dependencies.
 */

const request = require('superagent');

/**
 * Delete `topic`.
 *
 * @param {string} topic - Topic name.
 * @param {Function} fn - Callback.
 */

module.exports.deleteTopic = (topic, fn) => {
  req(topic, 'delete', fn);
};

/**
 * Create `topic`.
 *
 * @param {string} topic - Topic name.
 * @param {Function} fn - Callback.
 */

module.exports.createTopic = (topic, fn) => {
  req(topic, 'create', fn);
};

/**
 * Publish `topic`.
 *
 * @param {string} topic - Topic name.
 * @param {string} cmd - Command.
 * @param {Function} fn - Callback.
 * @function req
 */

function req(topic, cmd, fn) {
  request
    .post(`http://127.0.0.1:4151/topic/${cmd}`)
    .query({ topic })
    .end((err, res) => {
      if (err) {
        return fn(err);
      }

      if (res.error) {
        return fn(res.error);
      }

      fn();
    });
}

module.exports.framerData = [
  '000000b0000000007b226d61785f7264795f636f756e74223a323530302c2276657273696f6e223a22302e322e3234222c226d61785f6d73675f74696d656f7574223a3930303030302c226d73675f74696d656f7574223a36303030302c22746c735f7631223a66616c73652c226465666c617465223a66616c73652c226465666c6174655f6c6576656c223a302c226d61785f6465666c6174655f6c6576656c223a362c22736e61707079223a66616c73657d',
  '00000006000000004f4b',
  '0000002f00000002135a2ad167d76e45000130363236323534303166363566303038736f6d65206d6573736167652068657265',
  '062625401f65f008'
];
