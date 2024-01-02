'use strict';

/**
 * Module dependencies.
 */

const nsq = require('..');

// Subscribe.
const sub = nsq.reader({
  nsqd: ['0.0.0.0:4150'],
  maxInFlight: 5,
  topic: 'events',
  channel: 'ingestion'
});

sub.on('message', msg => {
  console.log('recv %s', msg.id);
  msg.finish();
});

// Publish.
const pub = nsq.writer();

setInterval(() => pub.publish('events', 'some message here'), 30);

setTimeout(() => {
  console.log('pausing');
  sub.pause();
}, 1500);

setTimeout(() => {
  console.log('resuming');
  sub.resume();
}, 10000);
