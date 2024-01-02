'use strict';

/**
 * Module dependencies.
 */

const nsq = require('..');

// Counts.
let sent = 0;
let recv = 0;

// Subscribe.
const reader = nsq.reader({
  nsqlookupd: ['0.0.0.0:4161'],
  maxInFlight: 5,
  topic: 'events',
  channel: 'ingestion'
});

setInterval(() => {
  console.log('  sent/recv: %d/%d', sent, recv);
}, 200);


reader.on('message', msg => {
  recv++;
  msg.finish();
});

reader.on('error', err => {
  console.error('reader error: %s', err.stack);
});

// Publish.
const writer = nsq.writer({ nsqlookupd: ['0.0.0.0:4161'] });

setInterval(() => {
  sent++;
  writer.publish('events', 'some message here', err => {
    if (err) {
      console.error('writer error: %s', err.stack);
    }
  });
}, 150);
