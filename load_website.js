'use strict';

const puppeteer = require('puppeteer-core');

module.exports = function(RED) {
    function PuppeteerLoadWebsiteNode(n) {
        RED.nodes.createNode(this, n);

        const node = this;
        node.url = n.url;
        node.config = RED.nodes.getNode(n.config);
        node.additionalDelayMs = n.additionalDelayMs;
        node.additionalSelectorWait = n.additionalSelectorWait;

        // To enable testing
        node.puppeteer = puppeteer;
        node.maxWaitForLoad = 15000;

        if (n.userDataDir) {
            node.userDataDir = RED.util.evaluateNodeProperty(n.userDataDir.value, n.userDataDir.input_type, node);
        }

        const openedBrowsers = {};

        node.on('input', function(msg, send, done) {
            const url = node.url || msg.url;
            if (!url) {
                const err = new Error('A URL is required');
                done(err);
                return;
            }

            const additionalDelayMs = parseInt(node.additionalDelayMs || msg.additionalDelayMs || '-1');
            const additionalSelectorWait = node.additionalSelectorWait || msg.additionalSelectorWait;
            const userDataDir = node.userDataDir || msg.userDataDir;
            (async () => {
                await node.config.takeInstance();

                const launchConfig = {
                    executablePath: node.config.executablePath,
                    defaultViewport: {
                        width: 1920,
                        height: 1080
                    }
                };
                if (userDataDir) {
                    launchConfig.userDataDir = userDataDir;
                }

                let loaded = false;
                function waitForLoaded() {
                    return new Promise(resolve => {
                        if (loaded) {
                            resolve();
                        } else {
                            setTimeout(() => {
                                node.debug('waited for 15 seconds for loaded event');
                                resolve();
                            }, node.maxWaitForLoad);
                        }
                    });
                }

                const browser = await node.puppeteer.launch(launchConfig);
                openedBrowsers[msg._msgid] = browser;
                const page = await browser.newPage();
                page.on('load', () => {
                    node.debug('loaded');
                    loaded = true;
                });
                // Not waiting for 'load' event to prevent getting stuck if a
                // page is badly coded and fails to load certain resources.
                const waitUntil = ['domcontentloaded'];
                let userAgent = await browser.userAgent();
                userAgent = userAgent.replace(' Raspbian', '');
                userAgent = userAgent.replace('HeadlessChrome', 'Chrome');
                page.setUserAgent(userAgent);
                node.emit('test:input:load');
                await page.goto(url, { waitUntil: waitUntil });
                await waitForLoaded();
                if (additionalDelayMs >= 1) {
                    await page.waitFor(additionalDelayMs);
                }
                if (additionalSelectorWait) {
                    await page.waitFor(additionalSelectorWait);
                }
                const html = await page.content();

                // Produce output for the node
                msg.payload = html;
                send(msg);

                await browser.close();
                delete openedBrowsers[msg._msgid];

                // Signal to Node-RED that handling for the msg is done
                node.emit('test:input:done');
                done();
            })().catch(e => {
                node.debug('error processing ' + url);
                node.debug(e);
                if (openedBrowsers[msg._msgid]) {
                    openedBrowsers[msg._msgid].close().then(() => {
                        delete openedBrowsers[msg._msgid];
                    });
                }
            }).finally(_ => node.config.releaseInstance());
        });

        function closeOpenBrowsers(done) {
            if (Object.keys(openedBrowsers).length) {
                const key = Object.keys(openedBrowsers)[0];
                openedBrowsers[key].close().then(() => {
                    delete openedBrowsers[key];
                }).catch(e => {
                    node.debug('error closing browser: ' + key);
                    node.debug(e);
                    delete openedBrowsers[key];
                }).finally(() => {
                    closeOpenBrowsers(done);
                });
            } else {
                node.emit('test:close:done');
                done();
            }
        }

        node.on('close', function(done) {
            node.debug('close');
            closeOpenBrowsers(done);
        });
    }

    RED.nodes.registerType('pptr load website', PuppeteerLoadWebsiteNode);
};
