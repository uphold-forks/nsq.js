'use strict';

/**
 * Module dependencies.
 */

const nsq = require('..');

// Subscribe.
const sub = nsq.reader({
  nsqd: ['0.0.0.0:4150'],
  maxInFlight: 10,
  topic: 'events',
  channel: 'ingestion'
});

sub.on('message', msg => {
  setTimeout(() => {
    console.log('... fin %s', msg.body);
    msg.finish();
  }, 10);
});

sub.on('close', () => {
  pub.close();
  console.log('... closed');
});

// Publish.
const pub = nsq.writer();

setTimeout(() => {
  console.log('... sending events');

  let n = 10;

  while (n--) {
    pub.publish('events', `${10 - n}`);
  }
}, 10);

setTimeout(() => {
  console.log('... closing');
  sub.close();
}, 20);
