'use strict';

const puppeteer = require('puppeteer-core');

module.exports = function(RED) {
    function PuppeteerLoadWebsiteNode(n) {
        RED.nodes.createNode(this, n);

        const node = this;
        node.url = n.url;
        node.executablePath = n.executablePath;
        node.additionalDelayMs = n.additionalDelayMs;
        node.additionalSelectorWait = n.additionalSelectorWait;

        node.on('input', function(msg, send, done) {
            // For backwards compatibility
            send = send || function() { node.send.apply(node, arguments); };

            const url = node.url || msg.url;
            if (!url) {
                const err = new Error('A URL is required');
                if (done) {
                    done(err);
                } else {
                    node.error(err);
                }
            }

            const additionalDelayMs = parseInt(node.additionalDelayMs || msg.additionalDelayMs || '-1');
            const additionalSelectorWait = node.additionalSelectorWait || msg.additionalSelectorWait;
            (async () => {
                const browser = await puppeteer.launch({
                    executablePath: node.executablePath,
                });
                const page = await browser.newPage();
                const waitUntil = ['load'];
                await page.goto(url, { waitUntil: waitUntil });
                if (additionalDelayMs >= 1) {
                    await page.waitFor(additionalDelayMs);
                }
                if (additionalSelectorWait) {
                    await page.waitFor(additionalSelectorWait);
                }
                const html = await page.content();

                // Produce output for the node
                send({
                    payload: html
                });

                await browser.close();

                // Signal to Node-RED that handling for the msg is done
                if (done) {
                    done();
                }
            })();
        });
    }

    RED.nodes.registerType('pptr load website', PuppeteerLoadWebsiteNode);
};
