'use strict';
module.exports = function(RED) {
    function ConfigNode(n) {
        RED.nodes.createNode(this, n);
        this.executablePath = n.executablePath;
    }
    RED.nodes.registerType('pptr config', ConfigNode);
};
