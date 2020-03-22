'use strict';
module.exports = function(RED) {
    function ConfigNode(n) {
        RED.nodes.createNode(this, n);

        const node = this;
        node.executablePath = n.executablePath;
        node.semaphoreCount = n.semaphoreCount || 1;

        node.availableInstance = node.semaphoreCount;
        node.fifoQueue = [];

        node.takeInstance = function() {
            return new Promise(resolve => {
                function doTake() {
                    node.availableInstance -= 1;
                    node.debug('Taking Chrome instance - ' + node.availableInstance + ' left');
                    resolve();
                }
                if (node.availableInstance === 0) {
                    node.debug('Have to wait for Chrome instance to become available');
                    node.fifoQueue.push(doTake);
                } else {
                    doTake();
                }
            });
        };

        node.releaseInstance = function() {
            node.availableInstance += 1;
            node.debug('Releasing Chrome instance - ' + node.availableInstance + ' left');
            if (node.fifoQueue.length) {
                const resolve = node.fifoQueue.shift();
                resolve();
            }
        };
    }
    RED.nodes.registerType('pptr config', ConfigNode);
};
