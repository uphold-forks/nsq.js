'use strict';

/**
 * Parse strings to object and pass-through other types.
 *
 * @param {string | object} str - String to parse.
 * @returns {object} Parsed address.
 * @private
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
 * @param {object} src - Source object.
 * @param {string} event - Event name.
 * @param {object} dst - Destination object.
 * @private
 */

module.exports.delegate = (src, event, dst) => {
  src.on(event, (...args) => {
    dst.emit(event, ...args);
  });
};

/**
 * Return address of `node`.
 *
 * @param {object} node - Node object.
 * @param {string} node.broadcast_address - Node broadcast address.
 * @param {string} node.tcp_port - Node tcp port.
 * @returns {string} Node address.
 * @private
 */

module.exports.nodeToAddress = node => `${node.broadcast_address}:${node.tcp_port}`;

/**
 * Normalize address to include the http scheme.
 *
 * @param {string} address - Address to normalize.
 * @returns {string} Normalized address.
 * @private
 */

module.exports.normalize = address => address.startsWith('http') ? address : `http://${address}`;

/**
 * Omits `TOPIC_NOT_FOUND` errors from the list of errors.
 *
 * @param {Array} errors - List of errors.
 * @returns {Array} Filtered list of errors.
 * @private
 */

module.exports.omitTopicNotFoundErrors = errors => {
  return errors.filter(error => {
    const message = error?.response?.body?.status_txt ?? error?.response?.body?.message;

    return message !== 'TOPIC_NOT_FOUND';
  });
};
