'use strict';
const sinon = require('sinon');
const should = require('should');
require('should-sinon');
const helper = require('node-red-node-test-helper');
const puppeteerNode = require('../puppeteer.js');
const configNode = require('../config.js');

helper.init(require.resolve('node-red'));

describe('puppeteer Node', function() {
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
                id: 'n1',
                type: 'puppeteer',
                name: 'test'
            }
        ];
        helper.load(puppeteerNode, flow, function() {
            const n1 = helper.getNode('n1');
            n1.should.have.property('name', 'test');
            done();
        });
    });

    it('should load with configuration', function(done) {
        const flow = [
            {
                id: 'n1',
                type: 'puppeteer',
                name: 'test',
                url: 'https://dannysu.com',
                config: 'c1',
                func: 'done();',
                userDataDir: {
                    value: '/test',
                    input_type: 'str'
                }
            },
            {
                id: 'c1',
                type: 'pptr config',
                name: 'test config',
                executablePath: '/test',
                semaphoreCount: 1
            }
        ];
        helper.load([puppeteerNode, configNode], flow, function() {
            const n1 = helper.getNode('n1');
            n1.should.have.property('name', 'test');
            n1.should.have.property('url', 'https://dannysu.com');
            should.exist(n1.config);
            n1.config.should.have.property('name', 'test config');
            n1.config.should.have.property('executablePath', '/test');
            n1.config.should.have.property('semaphoreCount', 1);
            n1.should.have.property('func', 'done();');
            n1.should.have.property('userDataDir', '/test');
            done();
        });
    });

    it('should use msg properties', function(done) {
        const flow = [
            {
                id: 'n1',
                type: 'puppeteer',
                name: 'test',
                config: 'c1',
                func: 'done();'
            },
            {
                id: 'c1',
                type: 'pptr config',
                name: 'test config',
                executablePath: '/test',
                semaphoreCount: 1
            }
        ];
        helper.load([puppeteerNode, configNode], flow, function() {
            const n1 = helper.getNode('n1');
            n1.maxDuration = 1;
            const mockPage = {
                setUserAgent: sinon.stub(),
                goto: sinon.stub().resolves(),
                on: sinon.stub()
            };
            const mockBrowser = {
                newPage: sinon.stub().resolves(mockPage),
                userAgent: sinon.stub().resolves('test user agent'),
                close: sinon.stub().resolves()
            };
            const mockPuppeteer = {
                launch: sinon.stub().resolves(mockBrowser)
            };
            n1.puppeteer = mockPuppeteer;
            n1.receive({
                _msgid: 'm1',
                url: 'https://dannysu.com',
                userDataDir: '/test'
            });
            n1.on('test:input:done', () => {
                mockPuppeteer.launch.should.be.calledWith(sinon.match.has('userDataDir', '/test'));
                mockPage.goto.should.be.calledWith('https://dannysu.com', sinon.match.any);
                mockBrowser.close.should.be.calledOnce();
                done();
            });
        });
    });

    it('close all existing browsers upon unload', function(done) {
        const flow = [
            {
                id: 'n1',
                type: 'puppeteer',
                name: 'test',
                config: 'c1',
                func: 'setTimeout(done, 1000);'
            },
            {
                id: 'c1',
                type: 'pptr config',
                name: 'test config',
                executablePath: '/test',
                semaphoreCount: 2
            }
        ];
        helper.load([puppeteerNode, configNode], flow, function() {
            const n1 = helper.getNode('n1');
            const mockPage1 = {
                setUserAgent: sinon.stub(),
                goto: sinon.stub().resolves(),
                on: sinon.stub()
            };
            const mockPage2 = {
                setUserAgent: sinon.stub(),
                goto: sinon.stub().resolves(),
                on: sinon.stub()
            };
            const mockBrowser1 = {
                newPage: sinon.stub().resolves(mockPage1),
                userAgent: sinon.stub().resolves('test user agent'),
                close: sinon.stub().resolves()
            };
            const mockBrowser2 = {
                newPage: sinon.stub().resolves(mockPage2),
                userAgent: sinon.stub().resolves('test user agent'),
                close: sinon.stub().resolves()
            };
            const mockPuppeteer = {
                launch: sinon.stub()
            };
            mockPuppeteer.launch.onCall(0).resolves(mockBrowser1);
            mockPuppeteer.launch.onCall(1).resolves(mockBrowser2);
            n1.puppeteer = mockPuppeteer;
            n1.receive({
                _msgid: 'm1',
                url: 'https://number1.com'
            });
            n1.receive({
                _msgid: 'm2',
                url: 'https://number2.com'
            });
            let loadCount = 0;
            n1.on('test:input:load', () => {
                loadCount++;
                if (loadCount === 2) {
                    helper.unload();
                }
            });
            n1.on('test:close:done', () => {
                mockBrowser1.close.should.be.calledOnce();
                mockBrowser2.close.should.be.calledOnce();
                done();
            });
        });
    });

    it('close all existing browsers upon unload even through errors', function(done) {
        const flow = [
            {
                id: 'n1',
                type: 'puppeteer',
                name: 'test',
                config: 'c1',
                func: 'setTimeout(done, 1000);'
            },
            {
                id: 'c1',
                type: 'pptr config',
                name: 'test config',
                executablePath: '/test',
                semaphoreCount: 2
            }
        ];
        helper.load([puppeteerNode, configNode], flow, function() {
            const n1 = helper.getNode('n1');
            const mockPage1 = {
                setUserAgent: sinon.stub(),
                goto: sinon.stub().resolves(),
                on: sinon.stub()
            };
            const mockPage2 = {
                setUserAgent: sinon.stub(),
                goto: sinon.stub().resolves(),
                on: sinon.stub()
            };
            const mockBrowser1 = {
                newPage: sinon.stub().resolves(mockPage1),
                userAgent: sinon.stub().resolves('test user agent'),
                close: sinon.stub().rejects()
            };
            const mockBrowser2 = {
                newPage: sinon.stub().resolves(mockPage2),
                userAgent: sinon.stub().resolves('test user agent'),
                close: sinon.stub().resolves()
            };
            const mockPuppeteer = {
                launch: sinon.stub()
            };
            mockPuppeteer.launch.onCall(0).resolves(mockBrowser1);
            mockPuppeteer.launch.onCall(1).resolves(mockBrowser2);
            n1.puppeteer = mockPuppeteer;
            n1.receive({
                _msgid: 'm1',
                url: 'https://number1.com'
            });
            n1.receive({
                _msgid: 'm2',
                url: 'https://number2.com'
            });
            let loadCount = 0;
            n1.on('test:input:load', () => {
                loadCount++;
                if (loadCount === 2) {
                    helper.unload();
                }
            });
            n1.on('test:close:done', () => {
                mockBrowser1.close.should.be.calledOnce();
                mockBrowser2.close.should.be.calledOnce();
                done();
            });
        });
    });

    it('handles error during processing', function(done) {
        const flow = [
            {
                id: 'n1',
                type: 'puppeteer',
                name: 'test',
                config: 'c1',
                func: 'throw new Error("test");'
            },
            {
                id: 'c1',
                type: 'pptr config',
                name: 'test config',
                executablePath: '/test',
                semaphoreCount: 1
            }
        ];
        helper.load([puppeteerNode, configNode], flow, function() {
            const c1 = helper.getNode('c1');
            const n1 = helper.getNode('n1');
            const mockPage = {
                setUserAgent: sinon.stub(),
                goto: sinon.stub().resolves(),
                on: sinon.stub()
            };
            const mockBrowser = {
                newPage: sinon.stub().resolves(mockPage),
                userAgent: sinon.stub().resolves('test user agent'),
                close: sinon.stub().resolves()
            };
            const mockPuppeteer = {
                launch: sinon.stub()
            };
            mockPuppeteer.launch.resolves(mockBrowser);
            n1.puppeteer = mockPuppeteer;
            n1.receive({
                _msgid: 'm1',
                url: 'https://number1.com'
            });
            n1.on('test:input:done', () => {
                mockBrowser.close.should.be.calledOnce();
            });
            n1.on('test:input:finally', () => {
                c1.availableInstance.should.be.eql(1);
                done();
            });
        });
    });
});
