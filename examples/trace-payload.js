'use strict';

// $ node examples/simple
// $ jstrace examples/trace-payload

/**
 * Module dependencies.
 */

const bytes = require('bytes');

module.exports.remote = traces => {
  traces.on('connection:message', trace => {
    traces.emit('message size', trace.msg.id, trace.msg.body.length);
  });
};

// bytes is a local dep, and may not be running
// in the remote process, so we send back some
// data ( the message size ) instead and report
// on it locally.

module.exports.local = traces => {
  traces.on('message size', (id, len) => {
    console.log('%s length %s', id, bytes(len));
  });
};
