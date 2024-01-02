'use strict';

/**
 * Module dependencies.
 */

const nsq = require('..');

// Subscribe.
const reader = nsq.reader({
  nsqd: ['0.0.0.0:4150'],
  topic: 'events',
  channel: 'ingestion',
  maxInFlight: 1000
});

let n = 0;
const runtime = parseInt(process.argv[2], 10) || 10000;

reader.on('message', msg => {
  process.stdout.write(`\r  ${n++}`);
  msg.finish();
});

// Publish.
const writer = nsq.writer();

function next() {
  writer.publish('events', ['foo', 'bar', 'baz'], next);
}

function finish() {
  process.stdout.write(`\rTotal messages sent: ${n} (${n / runtime} msg/ms)`);
  process.exit(0);
}

next();

setTimeout(() => finish(), runtime);
