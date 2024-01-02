'use strict';

/**
 * Module dependencies.
 */

const nsq = require('..');

// Subscribe.
const reader = nsq.reader({
  nsqd: ['0.0.0.0:4150'],
  maxInFlight: 1,
  maxAttempts: 5,
  topic: 'events',
  channel: 'ingestion'
});

reader.on('error', err => {
  console.log(err.stack);
});

reader.on('message', msg => {
  const body = msg.body.toString();
  console.log('%s attempts=%s', body, msg.attempts);
  msg.requeue(200);
});

reader.on('discard', msg => {
  const body = msg.body.toString();
  console.log('giving up on %s', body);
  msg.finish();
});

// Publish.
const writer = nsq.writer();

writer.publish('events', 'foo');
writer.publish('events', 'bar');
writer.publish('events', 'baz');
