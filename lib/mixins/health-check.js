'use strict';

/**
 * Health check handling mixin.
 *
 * @typedef {import('../reader')} Reader
 * @typedef {import('../writer')} Writer
 * @param {Reader | Writer} client - Reader or Writer instance.
 * @mixin
 * @private
 */

module.exports = client => {
  if (!client.healthCheck) {
    return;
  }

  client.getHealthStatus = () => {
    const healthData = { connections: { active: client.conns.size } };

    if (client.nsqd) {
      healthData.connections.expected = client.nsqd.length;
    }

    if (client.nsqlookupd) {
      healthData.lookups = {
        active: client.nsqlookupd.length - client.lookupErrors,
        expected: client.nsqlookupd.length
      };
    }

    return healthData;
  };
};
