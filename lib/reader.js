'use strict';

/**
 * Module dependencies.
 */

const { EventEmitter } = require('node:events');
const Connection = require('./connection');
const assert = require('node:assert');
const close = require('./mixins/close');
const debug = require('debug')('nsq:reader');
const lookup = require('nsq-lookup');
const ready = require('./mixins/ready');
const reconnect = require('./mixins/reconnect');
const utils = require('./utils');

class Reader extends EventEmitter {
  /**
   * Constructor.
   *
   * The Reader is in charge of establishing connections
   * between the given `nsqd` nodes, or looking them
   * up and connecting via `nsqlookupd`. Subscribes
   * are buffered so that no initialization is required.
   *
   * @param {Object} options
   * @param {String} options.topic - subscription topic
   * @param {String} options.channel - subscription channel
   * @param {String[]} [options.nsqd] - nsqd addresses
   * @param {String[]} [options.nsqlookupd] - nsqlookupd addresses
   * @param {Number} [options.maxAttempts=Infinity] - max attempts before discarding messages
   * @param {Number} [options.maxInFlight=10] - max messages in-flight
   * @param {Number} [options.pollInterval=10000] - nsqlookupd poll interval
   * @param {Number} [options.msgTimeout] - session-specific message timeout
   * @param {Boolean} [options.ready=true] - when `false` auto-RDY maintenance will be disabled
   * @param {Function} [options.trace] - trace function
   * @param {Number} [options.maxConnectionAttempts=Infinity] - max reconnection attempts
   * @param {String} [options.id] - client identifier
   * @api public
   */

  constructor(options) {
    super();

    // Check required options.
    assert(options.topic, '.topic required');
    assert(options.channel, '.channel required');
    assert(options.nsqd || options.nsqlookupd, '.nsqd or .nsqlookupd addresses required');

    // Initialize properties.
    this.trace = options.trace || function() {};
    this.maxConnectionAttempts = options.maxConnectionAttempts ?? Infinity;
    this.pollInterval = options.pollInterval || 20000;
    this.maxAttempts = options.maxAttempts || Infinity;
    this.maxInFlight = options.maxInFlight || 10;
    this.msgTimeout = options.msgTimeout;
    this.nsqlookupd = options.nsqlookupd;
    this.channel = options.channel;
    this.autoready = options.ready ?? true;
    this.topic = options.topic;
    this.nsqd = options.nsqd;
    this.id = options.id;
    this.connected = {};
    this.conns = new Set();
    this.timer = null;

    // Add close mixin.
    close(this);

    // Defer connecting to nodes.
    setImmediate(() => this.connect());
  }

  /**
   * Establish connections to the given nsqd instances,
   * or look them up via nsqlookupd.
   *
   * @api private
   */

  connect() {
    // If we have a list of nsqd nodes, connect to them.
    if (this.nsqd) {
      for (const address of this.nsqd) {
        this.connectTo(address);
      }

      return;
    }

    // If we have a list of nsqlookupd servers,
    // do a lookup for relevant nodes and connect to them.
    this.lookup((_, nodes) => {
      for (const node of nodes) {
        this.connectTo(node);
      }
    });

    // Setup polling for nodes from the nsqlookupd servers.
    this.poll();
  }

  /**
   * Poll for nsqlookupd additional nodes every `pollInterval`.
   *
   * @api private
   */

  poll() {
    debug('polling every %dms', this.pollInterval);

    this.timer = setInterval(() => {
      this.lookup((errors, nodes = []) => {
        if (errors) {
          debug('errors %j', errors);

          for (const error of errors) {
            this.emit('error lookup', error);
          }
        }

        for (const node of nodes) {
          this.connectTo(node);
        }
      });
    }, this.pollInterval);
  }

  /**
   * Lookup nsqd nodes via nsqlookupd addresses and invoke the callback `fn`.
   *
   * @param {Function} fn
   * @api private
   */

  lookup(fn) {
    const addrs = this.nsqlookupd.map(utils.normalize);

    debug('lookup %j', addrs);

    lookup(addrs, { timeout: 30000, topic: this.topic }, (errors, nodes) => {
      if (!Array.isArray(nodes)) {
        return fn();
      }

      debug('found %d nodes with topic %j', nodes.length, this.topic);

      fn(errors, nodes.map(utils.nodeToAddress));
    });
  }

  /**
   * Connect to nsqd at `addr`.
   *
   * @param {String} address
   * @api private
   */

  connectTo(address) {
    if (this.connected[address]) {
      return debug('already connected to %s', address);
    }

    this.connected[address] = true;

    debug('connect nsqd %s %s/%s [%d]', address, this.topic, this.channel, this.maxInFlight);

    const { host, port } = utils.parseAddress(address);

    // Create the nsqd connection.
    const conn = new Connection({
      maxInFlight: this.maxInFlight,
      maxAttempts: this.maxAttempts,
      msgTimeout: this.msgTimeout,
      trace: this.trace,
      host,
      port,
      id: this.id
    });

    // Apply reconnection mixin.
    reconnect(conn, this.maxConnectionAttempts);

    // Apply rdy state.
    if (this.autoready) {
      ready(conn);
    }

    // Apply event delegation.
    this.delegate(conn);

    // Once connection is ready, subscribe to topic.
    conn.on('ready', () => {
      conn.subscribe(this.topic, this.channel);

      if (this.autoready) {
        conn.ready(conn.maxInFlight);
      }
    });

    // Handle disconnection.
    conn.on('disconnect', () => {
      this.remove(conn);
      this.distributeMaxInFlight();
    });

    // Connect to the nsqd node.
    conn.connect(err => {
      if (err) {
        this.emit('error', err);
        this.remove(conn);

        return;
      }

      this.conns.add(conn);
      this.distributeMaxInFlight();
    });
  }

  /**
   * Remove a `conn` from the connected set.
   *
   * @param {Connection} conn
   * @api private
   */

  remove(conn) {
    debug('removing connection %s', conn.addr);

    this.connected[conn.addr] = false;
    this.conns.delete(conn);

    conn.emit = function() {};
    conn.removeAllListeners();
    conn.destroy();
  }

  /**
   * Delegate events from `conn`.
   *
   * @param {Connection} conn
   * @api private
   */

  delegate(conn) {
    utils.delegate(conn, 'error response', this);
    utils.delegate(conn, 'subscribed', this);
    utils.delegate(conn, 'closing', this);
    utils.delegate(conn, 'discard', this);
    utils.delegate(conn, 'message', this);
    utils.delegate(conn, 'connect', this);
    utils.delegate(conn, 'ready', this);
    utils.delegate(conn, 'error', this);
    utils.delegate(conn, 'end', this);
  }

  /**
   * Distribute per-connection maxInFlight.
   *
   * @api private
   */

  distributeMaxInFlight() {
    const maxInFlight = Math.ceil(this.maxInFlight / this.conns.size);

    debug('distribute RDY %s (%s) to %s connections', this.maxInFlight, maxInFlight, this.conns.size);

    this.conns.forEach(conn => {
      conn.maxInFlight = maxInFlight;
    });
  }

  /**
   * Distribute RDY `n` to the connected nodes.
   *
   * @param {Number} n
   * @api public
   */

  ready(n) {
    debug('ready %s', n);

    n = Math.floor(n / this.conns.size);

    this.conns.forEach(conn => conn.ready(n));
  }

  /**
   * Pause all connections.
   *
   * @api public
   */

  pause() {
    debug('pause');

    this.conns.forEach(conn => conn.pause());
  }

  /**
   * Resume all connections.
   *
   * @api public
   */

  resume() {
    debug('resume');

    this.conns.forEach(conn => conn.resume());
  }

  /**
   * Gracefully close the connections.
   *
   * @param {Function} [fn]
   * @api public
   */

  close(fn) {
    debug('close');

    if (fn) {
      this.once('close', fn);
    }

    clearInterval(this.timer);

    if (this.conns.size === 0) {
      this.emit('close');

      return;
    }

    this.conns.forEach(conn => {
      conn.close();
    });
  }

  /**
   * Close the connections.
   *
   * @param {Function} [fn]
   * @api public
   */

  end(fn) {
    debug('end');

    clearInterval(this.timer);

    let n = this.conns.size;

    if (n === 0 && fn) {
      fn();
    }

    this.conns.forEach(conn => {
      conn.end(() => {
        debug('%s - conn ended', conn.addr);

        if (fn && !--n) {
          fn();
        }
      });
    });
  }
}

/**
 * Expose `Reader`.
 */

module.exports = Reader;
