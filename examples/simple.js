'use strict';

/**
 * Module dependencies.
 */

const jstrace = require('jstrace');
const nsq = require('..');

// Subscribe.
const reader = nsq.reader({
  nsqd: ['0.0.0.0:4150'],
  maxInFlight: 5,
  topic: 'events',
  channel: 'ingestion',
  trace: jstrace
});

reader.on('message', msg => {
  console.log(msg.id);
  setTimeout(() => msg.finish(), 200);
});

// Publish.
const writer = nsq.writer();

setInterval(() => writer.publish('events', 'some message here'), 150);
