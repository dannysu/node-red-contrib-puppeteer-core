module.exports = function(RED) {
    'use strict';
    const puppeteer = require('puppeteer-core');
    const util = require('util');
    const vm = require('vm');

    function sendResults(node, send, _msgid, msgs, cloneFirstMessage) {
        if (msgs === null) {
            return;
        } else if (!util.isArray(msgs)) {
            msgs = [msgs];
        }
        let msgCount = 0;
        for (let m = 0; m < msgs.length; m++) {
            if (msgs[m]) {
                if (!util.isArray(msgs[m])) {
                    msgs[m] = [msgs[m]];
                }
                for (let n = 0; n < msgs[m].length; n++) {
                    let msg = msgs[m][n];
                    if (msg !== null && msg !== undefined) {
                        if (typeof msg === 'object' && !Buffer.isBuffer(msg) && !util.isArray(msg)) {
                            if (msgCount === 0 && cloneFirstMessage !== false) {
                                msgs[m][n] = RED.util.cloneMessage(msgs[m][n]);
                                msg = msgs[m][n];
                            }
                            msg._msgid = _msgid;
                            msgCount++;
                        } else {
                            let type = typeof msg;
                            if (type === 'object') {
                                type = Buffer.isBuffer(msg)?'Buffer':(util.isArray(msg)?'Array':'Date');
                            }
                            node.error(RED._("function.error.non-message-returned",{ type: type }));
                        }
                    }
                }
            }
        }
        if (msgCount>0) {
            send(msgs);
        }
    }

    function PuppeteerNode(n) {
        RED.nodes.createNode(this, n);

        const node = this;
        node.outstandingTimers = [];
        node.outstandingIntervals = [];
        node.url = n.url;
        node.config = RED.nodes.getNode(n.config);
        node.func = n.func;
        node.maxDuration = parseInt(n.maxDuration || '30000');

        if (n.userDataDir) {
            node.userDataDir = RED.util.evaluateNodeProperty(n.userDataDir.value, n.userDataDir.input_type, node);
        }

        // To enable testing
        node.puppeteer = puppeteer;
        node.maxWaitForLoad = 15000;

        const functionText = "(async (msg, page, waitForLoaded, __send__, __done__) => {\n" +
                             "    const __msgid__ = msg._msgid;\n" +
                             "    const node = {\n" +
                             "        id: __node__.id,\n" +
                             "        name: __node__.name,\n" +
                             "        log: __node__.log,\n" +
                             "        error: __node__.error,\n" +
                             "        warn: __node__.warn,\n" +
                             "        debug: __node__.debug,\n" +
                             "        trace: __node__.trace,\n" +
                             "        on: __node__.on,\n" +
                             "        status: __node__.status,\n" +
                             "        send: function(msgs, cloneMsg) { __node__.send(__send__, __msgid__, msgs, cloneMsg); },\n" +
                             "        done: __done__\n" +
                             "    };\n" +
                                  node.func + "\n" +
                             "})(msg, page, waitForLoaded, send, done)\n" +
                             "    .catch(done);";

        const sandbox = {
            console: console,
            util: util,
            Buffer: Buffer,
            Date: Date,
            RED: {
                util: RED.util
            },
            __node__: {
                id: node.id,
                name: node.name,
                log: function() {
                    node.log.apply(node, arguments);
                },
                error: function() {
                    node.error.apply(node, arguments);
                },
                warn: function() {
                    node.warn.apply(node, arguments);
                },
                debug: function() {
                    node.debug.apply(node, arguments);
                },
                trace: function() {
                    node.trace.apply(node, arguments);
                },
                send: function(send, id, msgs, cloneMsg) {
                    sendResults(node, send, id, msgs, cloneMsg);
                },
                on: function() {
                    if (arguments[0] === "input") {
                        throw new Error(RED._("function.error.inputListener"));
                    }
                    node.on.apply(node, arguments);
                },
                status: function() {
                    node.status.apply(node, arguments);
                }
            },
            context: {
                set: function() {
                    node.context().set.apply(node,arguments);
                },
                get: function() {
                    return node.context().get.apply(node,arguments);
                },
                keys: function() {
                    return node.context().keys.apply(node,arguments);
                },
                get global() {
                    return node.context().global;
                },
                get flow() {
                    return node.context().flow;
                }
            },
            flow: {
                set: function() {
                    node.context().flow.set.apply(node,arguments);
                },
                get: function() {
                    return node.context().flow.get.apply(node,arguments);
                },
                keys: function() {
                    return node.context().flow.keys.apply(node,arguments);
                }
            },
            global: {
                set: function() {
                    node.context().global.set.apply(node,arguments);
                },
                get: function() {
                    return node.context().global.get.apply(node,arguments);
                },
                keys: function() {
                    return node.context().global.keys.apply(node,arguments);
                }
            },
            env: {
                get: function(envVar) {
                    var flow = node._flow;
                    return flow.getSetting(envVar);
                }
            },
            setTimeout: function () {
                var func = arguments[0];
                var timerId;
                arguments[0] = function() {
                    sandbox.clearTimeout(timerId);
                    try {
                        func.apply(this,arguments);
                    } catch(err) {
                        node.error(err,{});
                    }
                };
                timerId = setTimeout.apply(this,arguments);
                node.outstandingTimers.push(timerId);
                return timerId;
            },
            clearTimeout: function(id) {
                clearTimeout(id);
                var index = node.outstandingTimers.indexOf(id);
                if (index > -1) {
                    node.outstandingTimers.splice(index,1);
                }
            },
            setInterval: function() {
                var func = arguments[0];
                var timerId;
                arguments[0] = function() {
                    try {
                        func.apply(this,arguments);
                    } catch(err) {
                        node.error(err,{});
                    }
                };
                timerId = setInterval.apply(this,arguments);
                node.outstandingIntervals.push(timerId);
                return timerId;
            },
            clearInterval: function(id) {
                clearInterval(id);
                var index = node.outstandingIntervals.indexOf(id);
                if (index > -1) {
                    node.outstandingIntervals.splice(index,1);
                }
            }
        };
        if (util.hasOwnProperty('promisify')) {
            sandbox.setTimeout[util.promisify.custom] = function(after, value) {
                return new Promise(function(resolve, reject) {
                    sandbox.setTimeout(function(){ resolve(value); }, after);
                });
            };
        }
        const context = vm.createContext(sandbox);
        try {
            node.script = vm.createScript(functionText, {
                filename: 'Puppeteer node:' + node.id + (node.name ? ' [' + node.name + ']' : ''), // filename for stack traces
                displayErrors: true
            });
        } catch(err) {
            // eg SyntaxError - which v8 doesn't include line number information
            // so we can't do better than this
            node.error(err);
        }

        const openedBrowsers = {};

        node.on('input', function(msg, send, doneFn) {
            let resolveFn = null;

            let waitForExecutionTimer = null;
            function waitForExecution() {
                return new Promise((resolve, reject) => {
                    resolveFn = resolve;
                    waitForExecutionTimer = setTimeout(function() {
                        waitForExecutionTimer = null;
                        resolveFn = null;
                        reject(new Error('timed out'));
                    }, node.maxDuration);
                });
            }

            function done(err) {
                if (waitForExecutionTimer) {
                    clearTimeout(waitForExecutionTimer);
                    waitForExecutionTimer = null;
                }
                if (openedBrowsers[msg._msgid]) {
                    openedBrowsers[msg._msgid].close().finally(() => {
                        delete openedBrowsers[msg._msgid];
                        if (resolveFn) {
                            resolveFn();
                            resolveFn = null;
                        }
                        node.emit('test:input:done');
                        doneFn(err);
                    });
                } else if (resolveFn) {
                    if (resolveFn) {
                        resolveFn();
                        resolveFn = null;
                    }
                    node.emit('test:input:done');
                    doneFn(err);
                }
            }

            const url = node.url || msg.url;
            if (!url) {
                const err = new Error('A URL is required');
                done(err);
                return;
            }

            let instancePromise = null;
            const userDataDir = node.userDataDir || msg.userDataDir;
            (async () => {
                instancePromise = node.config.takeInstance();
                await instancePromise;

                const launchConfig = {
                    executablePath: node.config.executablePath,
                    defaultViewport: {
                        width: 1920,
                        height: 1080
                    },
                    timeout: node.maxDuration
                };
                if (userDataDir) {
                    launchConfig.userDataDir = userDataDir;
                }

                let loaded = false;
                let waitForLoadedResolveFn = null;
                let waitForLoadedTimer = null;
                function waitForLoaded() {
                    return new Promise(resolve => {
                        if (loaded) {
                            resolve();
                        } else {
                            waitForLoadedResolveFn = resolve;
                            waitForLoadedTimer = setTimeout(() => {
                                node.debug('waited for 15 seconds for loaded event');
                                if (waitForLoadedResolveFn) {
                                    waitForLoadedResolveFn();
                                    waitForLoadedResolveFn = null;
                                }
                            }, node.maxWaitForLoad);
                        }
                    });
                }

                const browser = await node.puppeteer.launch(launchConfig);
                openedBrowsers[msg._msgid] = browser;
                const page = await browser.newPage();
                page.on('load', () => {
                    node.emit('test:input:loaded');
                    node.debug('loaded');
                    loaded = true;
                    if (waitForLoadedTimer) {
                        clearTimeout(waitForLoadedTimer);
                        waitForLoadedTimer = null;
                    }
                    if (waitForLoadedResolveFn) {
                        waitForLoadedResolveFn();
                        waitForLoadedResolveFn = null;
                    }
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

                context.msg = msg;
                context.send = send;
                context.page = page;
                context.done = done;
                context.waitForLoaded = waitForLoaded;

                try {
                    const executionPromise = waitForExecution();
                    node.script.runInContext(context);
                    await executionPromise;
                } catch(err) {
                    if ((typeof err === "object") && err.hasOwnProperty("stack")) {
                        //remove unwanted part
                        var index = err.stack.search(/\n\s*at ContextifyScript.Script.runInContext/);
                        err.stack = err.stack.slice(0, index).split('\n').slice(0,-1).join('\n');
                        var stack = err.stack.split(/\r?\n/);

                        //store the error in msg to be used in flows
                        msg.error = err;

                        var line = 0;
                        var errorMessage;
                        if (stack.length > 0) {
                            while (line < stack.length && stack[line].indexOf("ReferenceError") !== 0) {
                                line++;
                            }

                            if (line < stack.length) {
                                errorMessage = stack[line];
                                var m = /:(\d+):(\d+)$/.exec(stack[line+1]);
                                if (m) {
                                    var lineno = Number(m[1])-1;
                                    var cha = m[2];
                                    errorMessage += " (line "+lineno+", col "+cha+")";
                                }
                            }
                        }
                        if (!errorMessage) {
                            errorMessage = err.toString();
                        }
                        done(errorMessage);
                    }
                    else if (typeof err === "string") {
                        done(err);
                    }
                    else {
                        done(JSON.stringify(err));
                    }
                }
            })().catch(e => {
                node.debug('error processing ' + url);
                node.debug(e);
                if (openedBrowsers[msg._msgid]) {
                    openedBrowsers[msg._msgid].close().finally(() => {
                        delete openedBrowsers[msg._msgid];
                        done(e);
                    });
                } else {
                    done(e);
                }
            }).finally(_ => {
                if (instancePromise) {
                    instancePromise = null;
                    node.config.releaseInstance()
                }
                node.emit('test:input:finally');
            });
        });

        function closeOpenBrowsers(done) {
            if (Object.keys(openedBrowsers).length) {
                const key = Object.keys(openedBrowsers)[0];
                openedBrowsers[key].close().catch(e => {
                    node.debug('error closing browser: ' + key);
                    node.debug(e);
                }).finally(() => {
                    delete openedBrowsers[key];
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

    RED.nodes.registerType('puppeteer', PuppeteerNode);
};
