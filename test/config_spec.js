'use strict';
const helper = require('node-red-node-test-helper');
const configNode = require('../config.js');

helper.init(require.resolve('node-red'));

describe('config Node', function() {
    beforeEach(function(done) {
        helper.startServer(done);
    });

    afterEach(function(done) {
        helper.unload();
        helper.stopServer(done);
    });

    it('should be loaded', function(done) {
        const flow = [
            {
                id: 'c1',
                type: 'pptr config',
                name: 'test config',
                executablePath: '/test',
                semaphoreCount: 1
            }
        ];
        helper.load(configNode, flow, function() {
            const c1 = helper.getNode('c1');
            c1.should.have.property('name', 'test config');
            c1.should.have.property('executablePath', '/test');
            c1.should.have.property('semaphoreCount', 1);
            done();
        });
    });

    it('should track single take & release', function(done) {
        const flow = [
            {
                id: 'c1',
                type: 'pptr config',
                name: 'test config',
                executablePath: '/test',
                semaphoreCount: 1
            }
        ];
        helper.load(configNode, flow, function() {
            const c1 = helper.getNode('c1');
            c1.takeInstance();
            c1.availableInstance.should.be.eql(0);
            c1.releaseInstance();
            c1.availableInstance.should.be.eql(1);
            done();
        });
    });

    it('should cause caller to wait on taken instance', function(done) {
        const flow = [
            {
                id: 'c1',
                type: 'pptr config',
                name: 'test config',
                executablePath: '/test',
                semaphoreCount: 1
            }
        ];
        helper.load(configNode, flow, function() {
            const c1 = helper.getNode('c1');

            let take1Resolved = false;
            let take1Rejected = false;
            const take1 = c1.takeInstance();
            take1.then(() => {
                take1Resolved = true;
            }).catch(() => {
                take1Rejected = true;
            });
            Promise.resolve().then(() => {
                // Expecting that taking the 1 availableInstance will resolve
                // the Promise immediately
                take1Resolved.should.be.true();
                take1Rejected.should.be.false();

                let take2Resolved = false;
                let take2Rejected = false;
                const take2 = c1.takeInstance();
                take2.then(() => {
                    take2Resolved = true;
                }).catch(() => {
                    take2Rejected = true;
                });
                Promise.resolve().then(() => {
                    // Expecting that when no instances are available, the
                    // Promise will be in pending state.
                    take2Resolved.should.be.false();
                    take2Rejected.should.be.false();

                    c1.releaseInstance();

                    Promise.resolve().then(() => {
                        // After the taken instance is released, then the
                        // pending Promise becomes resolved.
                        take2Resolved.should.be.true();
                        take2Rejected.should.be.false();
                        done();
                    });
                });
            });
        });
    });
});
