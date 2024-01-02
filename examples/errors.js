'use strict';

/**
 * Module dependencies.
 */

const nsq = require('..');

// Subscribe.
const reader = nsq.reader({
  nsqd: ['0.0.0.0:4150'],
  maxInFlight: 5,
  topic: 'events',
  channel: 'ingestion'
});

reader.on('message', msg => {
  console.log(msg.id);
  setTimeout(() => msg.finish(), 200);
});

reader.on('error', err => {
  console.error('reader error: %s', err.stack);
});

// Publish.
const writer = nsq.writer();

setInterval(() => {
  writer.publish('events', 'some message here', err => {
    if (err) {
      console.error('writer error: %s', err.stack);
    }
  });
}, 150);

process.on('uncaughtException', err => {
  console.error('Uncaught: %s', err.stack);
  process.exit(1);
});
