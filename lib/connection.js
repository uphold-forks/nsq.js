'use strict';

/**
 * Module dependencies.
 */

const { EventEmitter } = require('node:events');
const { delegate } = require('./utils');
const Framer = require('./framer');
const Message = require('./message');
const assert = require('node:assert');
const debug = require('debug')('nsq:connection');
const net = require('node:net');
const os = require('node:os');
const pkg = require('../package');

/**
 * Hostname.
 */

const host = os.hostname();

/**
 * Channel and topic name regex.
 */

const VALID_NAME_REGEX = /^[a-zA-Z0-9._-]+(#ephemeral)?$/;

class Connection extends EventEmitter {
  /**
   * Constructor.
   *
   * @param {object} [options={}]
   * @param {string} [options.host='0.0.0.0'] - Hostname.
   * @param {number} [options.port=4150] - Port number.
   * @param {number} [options.maxAttempts=Infinity] - Max attempts before discarding messages.
   * @param {number} [options.maxInFlight=1] - Max messages in-flight.
   * @param {number} [options.msgTimeout] - Session-specific message timeout.
   * @param {Function} [options.trace] - Trace function.
   * @param {string} [options.id] - Client identifier.
   * @class
   * @private
   */

  constructor(options = {}) {
    super();

    this.trace = options.trace || function () {};
    this.port = options.port || 4150;
    this.host = options.host || '0.0.0.0';
    this.addr = `${this.host}:${this.port}`;
    this.maxInFlight = options.maxInFlight || 1;
    this.maxAttempts = options.maxAttempts || Infinity;
    this.callbacks = [];
    this.inFlight = 0;
    this.version = 2;
    this.identity = {
      feature_negotiation: true,
      short_id: host.split('.')[0],
      long_id: host,
      user_agent: `${pkg.name}/${pkg.version}`,
      msg_timeout: options.msgTimeout,
      client_id: options.id
    };
  }

  /**
   * Initialize connection by sending the version and identifying.
   *
   * @param {Function} [fn] - Callback function.
   * @private
   */

  connect(fn) {
    const { callbacks } = this;

    // Reset state.
    this.closing = false;
    this.callbacks = [];

    debug('%s - connect V%s', this.addr, this.version);

    // Framer.
    this.framer = new Framer();
    this.framer.on('frame', frame => this.onFrame(frame));

    // Socket.
    this.sock = net.connect({ host: this.host, port: this.port });
    this.sock.on('data', data => this.framer.write(data));

    delegate(this.sock, 'connect', this);
    delegate(this.sock, 'close', this);
    delegate(this.sock, 'end', this);

    this.sock.on('close', () => {
      this._ready = false;

      if (callbacks.length || this.callbacks.length) {
        const err = new Error('socket closed without releasing callbacks');

        error(err, callbacks);
        error(err, this.callbacks);
      }
    });

    this.sock.on('error', err => {
      debug('%s - socket error: %s', this.addr, err.message);

      this._ready = false;
      err.message = `${this.addr}: ${err.message}`;
      err.address = this.addr;

      error(err, callbacks);
      error(err, this.callbacks);

      this.emit('error', err);
    });

    this.sock.write(`  V${this.version}`);
    this.identify(fn);
  }

  /**
   * Handles command callbacks.
   *
   * @param {Function} fn - Callback function.
   * @private
   */

  handleCallback(fn) {
    return (err, res) => {
      if (fn) {
        return fn(err, res);
      }

      if (err) {
        debug('%s - unhandled error: %s', this.addr, err);
      }
    };
  }

  /**
   * Handle `frame`.
   *
   * @param {object} frame
   * @param {number} frame.type - Frame type.
   * @param {Buffer} frame.body - Frame body.
   * @private
   */

  onFrame(frame) {
    // Response.
    if (frame.type === 0) {
      const res = frame.body.toString();

      debug('%s - response %s', this.addr, res);

      if (res === '_heartbeat_') {
        return this.nop();
      }

      const fn = this.callbacks.shift();

      if (fn) {
        return fn(null, res);
      }

      const err = new Error('invalid state');

      err.response = res;
      err.ready = this._ready;
      err.closing = this.closing;

      this.emit('error', err);

      return;
    }

    // Error.
    if (frame.type === 1) {
      const res = frame.body.toString();
      const err = new Error(`${this.addr}: ${res}`);
      const fn = this.callbacks.shift();

      debug('%s - error %s', this.addr, res);

      if (fn) {
        fn(err);
      } else {
        this.emit('error response', err);
      }

      return;
    }

    // Message.
    if (frame.type === 2) {
      ++this.inFlight;

      const message = new Message(frame.body, this);

      this.trace('connection:message', { msg: message });
      debug('%s - message %s attempts=%s', this.addr, message.id, message.attempts);

      if (message.attempts > this.maxAttempts) {
        message.finish();
        this.emit('discard', message);
      } else {
        this.emit('message', message);
      }

      return;
    }

    debug('Unknown frame type: %s', frame.type);
  }

  /**
   * Sends command `name` with `args`, with optional body `data` and callback `fn`.
   *
   * @param {string} name - Command name.
   * @param {Array} args - Command arguments.
   * @param {string | Buffer | Array} data - Command data.
   * @param {Function} [fn] - Callback function.
   * @private
   */

  command(name, args = [], data, fn) {
    debug('%s - command: %s %j', this.addr, name, args);

    const waiting = hasResponse(name);
    const chunks = [];

    // Socket closed.
    if (this.closed) {
      debug('%s - ignoring %s socket was closed', this.addr, name);

      return;
    }

    // Handle argument signature without data.
    if (typeof data === 'function') {
      fn = data;
      data = null;
    }

    // Pending response callback.
    if (waiting) {
      this.callbacks.push(fn);
    }

    // Add command.
    chunks.push(coerce(`${name} ${args.join(' ')}\n`));

    // Add data.
    if (data) {
      if (Array.isArray(data)) {
        data = data.map(coerce);

        chunks.push(int32(length(data)));
        chunks.push(int32(data.length));

        data.forEach(part => {
          chunks.push(int32(part.length));
          chunks.push(part);
        });
      } else {
        data = coerce(data);

        chunks.push(int32(data.length));
        chunks.push(data);
      }
    }

    // Flush data to the socket.
    const buffer = Buffer.concat(chunks);

    this.sock.write(buffer, () => {
      if (!waiting && fn) {
        fn();
      }
    });
  }

  /**
   * Identifies the client, and on success, marks this connection as ready.
   *
   * @param {Function} [fn] - Callback function.
   * @private
   */

  identify(fn) {
    debug('%s - identify %j', this.addr, this.identity);

    fn = this.handleCallback(fn);

    this.command('IDENTIFY', [], JSON.stringify(this.identity), (err, res) => {
      if (!err) {
        try {
          this.features = JSON.parse(res);
          this._ready = true;
          this.emit('ready');
        } catch (e) {
          err = new Error(`failed to parse response "${res}"`);
        }
      }

      fn(err);
    });
  }

  /**
   * Subscribe to `topic` / `channel`.
   *
   * @param {string} topic - Topic name.
   * @param {string} channel - Channel name.
   * @param {Function} [fn] - Callback function.
   * @private
   */

  subscribe(topic, channel, fn) {
    assertValidTopic(topic);
    assertValidChannel(channel);

    fn = this.handleCallback(fn);

    if (!this._ready) {
      return fn(new Error('cannot subscribe, connection not ready'));
    }

    this.command('SUB', [topic, channel], (err, res) => {
      this.emit('subscribed', topic);

      fn(err, res);
    });
  }

  /**
   * Publish `data` to `topic`.
   *
   * @param {string} topic - Topic name.
   * @param {Buffer} data - Data to publish.
   * @param {Function} [fn] - Callback function.
   * @private
   */

  publish(topic, data, fn) {
    assertValidTopic(topic);

    fn = this.handleCallback(fn);

    if (!this._ready) {
      return fn(new Error('cannot publish, connection not ready'));
    }

    this.command('PUB', [topic], data, fn);
  }

  /**
   * Publish `msgs` to `topic`.
   *
   * @param {string} topic - Topic name.
   * @param {Array} msgs - Array of messages to publish.
   * @param {Function} [fn] - Callback function.
   * @private
   */

  mpublish(topic, msgs, fn) {
    assertValidTopic(topic);
    assert(Array.isArray(msgs), 'msgs must be an array');

    fn = this.handleCallback(fn);

    if (!this._ready) {
      return fn(new Error('cannot mpublish, connection not ready'));
    }

    this.command('MPUB', [topic], msgs, fn);
  }

  /**
   * Send ready count `n`.
   *
   * @param {number} n - Count.
   * @private
   */

  ready(n) {
    assert('number' == typeof n, 'count must be a number');
    assert(n >= 0, 'count must be positive');

    this.lastReady = n;

    this.command('RDY', [n]);
    this.trace('connection:ready', { count: n, connection: this });
  }

  /**
   * Mark message `id` as finished.
   *
   * @param {string} id - Message id.
   * @param {Function} [fn] - Callback function.
   * @private
   */

  finish(id, fn) {
    assertValidMessageId(id);

    fn = this.handleCallback(fn);

    if (!this._ready) {
      return fn(new Error('cannot finish, connection not ready'));
    }

    this.command('FIN', [id], err => {
      this.emit('finish', id);

      --this.inFlight;

      fn(err);
    });
  }

  /**
   * Mark message `id` for requeueing with optional
   * `timeout` before it's triggered for processing.
   *
   * @param {string} id - Message id.
   * @param {number} [timeout=0] - Timeout in milliseconds.
   * @param {Function} [fn] - Callback function.
   * @private
   */

  requeue(id, timeout, fn) {
    assertValidMessageId(id);

    fn = this.handleCallback(fn);

    if (!this._ready) {
      return fn(new Error('cannot requeue, connection not ready'));
    }

    this.command('REQ', [id, timeout || 0], err => {
      this.emit('requeue', id);

      --this.inFlight;

      fn(err);
    });
  }

  /**
   * Reset the timeout for an in-flight message.
   *
   * @param {string} id - Message id.
   * @param {Function} [fn] - Callback function.
   * @private
   */

  touch(id, fn) {
    assertValidMessageId(id);

    fn = this.handleCallback(fn);

    if (!this._ready) {
      return fn(new Error('cannot touch, connection not ready'));
    }

    this.command('TOUCH', [id], err => {
      this.emit('touch', id);
      fn(err);
    });
  }

  /**
   * Send NOP.
   *
   * @api private
   */

  nop() {
    this.command('NOP', []);
  }

  /**
   * Cleanly close the connection.
   *
   * @param {Function} [fn] - Callback function.
   * @private
   */

  close(fn) {
    debug('%s - close', this.addr);

    if (this.closing) {
      return;
    }

    this.closing = true;

    this.command('CLS', [], err => {
      if (!err) {
        this.emit('closing');
      }

      fn?.();
    });
  }

  /**
   * Pause the connection.
   *
   * @description The "pause" event is used by the `ready()` mixin.
   * @private
   */

  pause() {
    debug('%s - pause', this.addr);
    this.emit('pause');
  }

  /**
   * Unpause the connection.
   *
   * @description The "resume" event is used by the `ready()` mixin.
   * @private
   */

  resume() {
    debug('%s - resume', this.addr);
    this.emit('resume');
  }

  /**
   * Close the connection.
   *
   * @private
   */

  end(fn) {
    debug('%s - end', this.addr);

    this.closing = true;

    if (fn) {
      this.sock.once('close', fn);
    }

    this.closed = true;
    this.sock.end();
  }

  /**
   * Dirty close of the connection.
   *
   * @private
   */

  destroy() {
    debug('destroy');

    this.sock.emit = function () {};

    this.sock.destroy();
  }
}

/**
 * Assert valid message `id`.
 *
 * @param {string} id - Message id.
 * @throws {Error} Invalid message id.
 * @function assertValidMessageId
 * @private
 */

function assertValidMessageId(id) {
  if (Buffer.byteLength(id) > 16) {
    throw new Error(`invalid message id "${id}"`);
  }
}

/**
 * Assert valid topic `name`.
 *
 * @param {string} name - Topic name.
 * @throws {Error} Invalid topic name.
 * @function assertValidTopic
 * @private
 */

function assertValidTopic(name) {
  if (!name.length || name.length > 64 || !VALID_NAME_REGEX.test(name)) {
    throw new Error(`invalid topic name "${name}"`);
  }
}

/**
 * Assert valid channel `name`.
 *
 * @param {string} name - Channel name.
 * @throws {Error} Invalid channel name.
 * @function assertValidChannel
 * @private
 */

function assertValidChannel(name) {
  if (!name.length || name.length > 64 || !VALID_NAME_REGEX.test(name)) {
    throw new Error(`invalid channel name "${name}"`);
  }
}

/**
 * Sum of `buffers`.
 *
 * @param {Array} buffers - Array of buffers.
 * @returns {number} Sum of buffer lengths.
 * @function length
 * @private
 */

function length(buffers) {
  return buffers.reduce((sum, buffer) => sum + buffer.length, 0);
}

/**
 * Coerce to a buffer.
 *
 * @param {string | Buffer} value
 * @returns {Buffer}
 * @function coerce
 * @private
 */

function coerce(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

/**
 * Return int32be representation of `n`.
 *
 * @param {number} n - Number.
 * @returns {Buffer} Int32BE buffer.
 * @function int32
 * @private
 */

function int32(n) {
  const buffer = new Buffer.alloc(4);

  buffer.writeInt32BE(n, 0);

  return buffer;
}

/**
 * Checks if command `name` has a response.
 *
 * @param {string} name - Command name.
 * @returns {boolean} `true` if command has a response, `false` otherwise.
 * @function hasResponse
 * @private
 */

function hasResponse(name) {
  return ['IDENTIFY', 'SUB', 'PUB', 'MPUB', 'CLS'].includes(name);
}

/**
 * Passes `err` to `fns` callbacks.
 *
 * @param {Error} err - Error.
 * @param {Array} fns - Callback functions.
 * @function error
 * @private
 */

function error(err, fns) {
  debug('broadcast error to %d functions', fns.length);

  // Pop them off the queue in order and make sure they are called only once.
  for (let fn = fns.shift(); fn !== undefined; fn = fns.shift()) {
    fn(err);
  }
}

/**
 * Expose `Connection`.
 */

module.exports = Connection;
