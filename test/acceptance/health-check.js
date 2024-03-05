'use strict';

/**
 * Module dependencies.
 */

const assert = require('node:assert');
const Reader = require('../../lib/reader');
const Writer = require('../../lib/writer');
const sinon = require('sinon');
const uid = require('uid');
const utils = require('../utils');
const Connection = require('../../lib/connection');

describe('Acceptance: Health Check', () => {
  describe('Reader', () => {
    let topic;

    afterEach(done => {
      utils.deleteTopic(topic, () => done());
    });

    beforeEach(done => {
      topic = uid();
      utils.createTopic(topic, () => done());
    });

    describe('using nsqd', () => {
      it('should send a message with the connections that are expected and active', done => {
        const reader = new Reader({
          topic,
          channel: 'reader',
          healthCheck: true,
          nsqd: ['127.0.0.1:4150']
        });

        reader.on('subscribed', () => {
          try {
            const healthCheck = reader.getHealthStatus();

            assert.equal(healthCheck.connections.active, 1);
            assert.equal(healthCheck.connections.expected, 1);

            reader.end();

            done();
          } catch (error) {
            done(error);
          }
        });
      });

      it('should show that connections are failing', done => {
        const reader = new Reader({
          topic: topic,
          channel: 'reader',
          healthCheck: true,
          nsqd: ['127.0.0.1:4150']
        });

        reader.on('error', () => {});
        sinon.stub(Connection.prototype, 'connect').callsFake(fn => fn(new Error()));
        sinon.stub(Connection.prototype, 'destroy');

        setTimeout(() => {
          try {
            const healthCheck = reader.getHealthStatus();

            assert.equal(healthCheck.connections.active, 0);
            assert.equal(healthCheck.connections.expected, 1);

            reader.end();
            sinon.restore();

            done();
          } catch (error) {
            done(error);
          }
        }, 50);
      });
    });

    describe('using nsqlookupd', () => {
      it('should send a message with the connections that are active and the lookups that are expected and active', done => {
        const reader = new Reader({
          topic,
          channel: 'reader',
          healthCheck: true,
          nsqlookupd: ['127.0.0.1:4161']
        });

        reader.on('subscribed', () => {
          try {
            const healthCheck = reader.getHealthStatus();

            assert.equal(healthCheck.connections.active, 1);
            assert.equal(healthCheck.lookups.active, 1);
            assert.equal(healthCheck.lookups.expected, 1);

            reader.end();

            done();
          } catch (error) {
            done(error);
          }
        });
      });

      it('should show that lookups are failing', done => {
        const reader = new Reader({
          topic: topic + '1',
          channel: 'reader',
          healthCheck: true,
          nsqlookupd: ['127.0.0.1:4161']
        });

        setTimeout(() => {
          try {
            const healthCheck = reader.getHealthStatus();

            assert.equal(healthCheck.connections.active, 0);
            assert.equal(healthCheck.lookups.active, 0);
            assert.equal(healthCheck.lookups.expected, 1);

            reader.end();

            done();
          } catch (error) {
            done(error);
          }
        }, 50);
      });

      it('should show that connections are failing', done => {
        const reader = new Reader({
          topic: topic,
          channel: 'reader',
          healthCheck: true,
          nsqlookupd: ['127.0.0.1:4161']
        });

        reader.on('error', () => {});
        sinon.stub(Connection.prototype, 'connect').callsFake(fn => fn(new Error()));
        sinon.stub(Connection.prototype, 'destroy');

        setTimeout(() => {
          try {
            const healthCheck = reader.getHealthStatus();

            assert.equal(healthCheck.connections.active, 0);
            assert.equal(healthCheck.lookups.active, 1);
            assert.equal(healthCheck.lookups.expected, 1);

            reader.end();
            sinon.restore();

            done();
          } catch (error) {
            done(error);
          }
        }, 50);
      });
    });
  });

  describe('Writer', () => {
    it('should send a message with the connections that are expected and active', done => {
      const writer = new Writer({
        healthCheck: true,
        nsqd: ['127.0.0.1:4150']
      });

      setTimeout(() => {
        try {
          const healthCheck = writer.getHealthStatus();

          assert.equal(healthCheck.connections.active, 1);
          assert.equal(healthCheck.connections.expected, 1);

          writer.close();

          done();
        } catch (error) {
          done(error);
        }
      }, 50);
    });

    it('should show that connections are failing', done => {
      const writer = new Writer({
        healthCheck: true,
        nsqd: ['127.0.0.1:41500']
      });

      writer.on('error', () => {});

      setTimeout(() => {
        try {
          const healthCheck = writer.getHealthStatus();

          assert.equal(healthCheck.connections.active, 0);
          assert.equal(healthCheck.connections.expected, 1);

          sinon.restore();
          writer.close();

          done();
        } catch (error) {
          done(error);
        }
      }, 50);
    });
  });
});
