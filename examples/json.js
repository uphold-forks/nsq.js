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
  console.log('%s %j', msg.id, msg.json());
  setTimeout(() => msg.finish(), 200);
});

// Publish.
const writer = nsq.writer();

setInterval(() => writer.publish('events', { type: 'login', user: 'tobi' }), 150);
