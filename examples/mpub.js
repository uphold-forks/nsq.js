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
  console.log(msg.body.toString());
  setTimeout(() => msg.finish(), 200);
});

// Publish.
const writer = nsq.writer();

setInterval(() => writer.publish('events', ['foo', 'bar', 'baz']), 150);
