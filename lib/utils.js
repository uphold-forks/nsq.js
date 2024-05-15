'use strict';

/**
 * Parse strings to object and pass-through other types.
 *
 * @param {String|Object} str
 * @return {Object}
 * @api private
 */

module.exports.parseAddress = str => {
  if (typeof str !== 'string') {
    return str;
  }

  const [host = '0.0.0.0', port = '4150'] = str.split(':');

  return { host, port };
};

/**
 * Delegate `src` `event` to `dst`.
 *
 * @param {Object} src
 * @param {String} event
 * @param {Object} dst
 * @api private
 */

module.exports.delegate = (src, event, dst) => {
  src.on(event, (...args) => {
    dst.emit(event, ...args);
  });
};

/**
 * Return address of `node`.
 *
 * @param {Object} node
 * @param {String} node.broadcast_address
 * @param {String} node.tcp_port
 * @returns {String}
 * @api private
 */

module.exports.nodeToAddress = node => `${node.broadcast_address}:${node.tcp_port}`;

/**
 * Normalize address to include the http scheme.
 *
 * @param {String} address
 * @returns {String}
 * @api private
 */

module.exports.normalize = address => address.startsWith('http') ? address : `http://${address}`;

/**
 * Omits TOPIC_NOT_FOUND errors from the list of errors.
 *
 * @param {Array} errors
 * @returns {Array}
 * @api private
 */

module.exports.omitTopicNotFoundErrors = errors => {
  return errors.filter(error => {
    const message = error?.response?.body?.status_txt ?? error?.response?.body?.message;

    return message !== 'TOPIC_NOT_FOUND';
  });
};
