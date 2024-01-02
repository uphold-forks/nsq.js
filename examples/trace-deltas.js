'use strict';

// $ node examples/simple
// $ jstrace examples/trace-deltas

module.exports.remote = traces => {
  const d = {};

  traces.on('connection:message', trace => {
    d[trace.msg.id] = trace.timestamp;
  });

  traces.on('message:finish', trace => {
    const start = d[trace.msg.id];

    if (!start) {
      return;
    }

    console.log('%s took %sms', trace.msg.id, trace.timestamp - start);
  });
};
