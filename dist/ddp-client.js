'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var DDPClient = function () {
    // { coll_name => [cb1, cb2, ...] }
    // { deferred_id => deferred_object }

    function DDPClient(uriOrSocket) {
        var _this2 = this;

        _classCallCheck(this, DDPClient);

        this.sock = null;
        this.defs = {};
        this.subs = {};
        this.watchers = {};
        this.collections = {};
        this._connectDeferred = null;
        this._ids = {
            count: 0,
            next: function next() {
                return String(++this.count);
            }
        };
        this._messageHandlers = {
            result: function result(data) {
                if (data.error) {
                    this.defs[data.id].reject(data.error.reason);
                } else if (typeof data.result !== 'undefined') {
                    this.defs[data.id].resolve(data.result);
                }
            },
            updated: function updated(msg) {
                // TODO method call was acked
            },
            changed: function changed(msg) {
                var collection = msg.collection;
                var id = msg.id;
                var fields = msg.fields;
                var cleared = msg.cleared;

                var coll = this.collections[collection];

                if (fields) {
                    Object.assign(coll[id], fields);
                } else if (cleared) {
                    for (var i = 0; i < cleared.length; i++) {
                        var fieldName = cleared[i];
                        delete coll[id][fieldName];
                    }
                }

                var changedDoc = coll[id];
                this._notifyWatchers(collection, changedDoc, id, msg.msg);
            },
            added: function added(msg) {
                var collName = msg.collection;
                var id = msg.id;
                if (!this.collections[collName]) {
                    this.collections[collName] = {};
                }
                /* NOTE: Ordered docs will have a 'before' field containing the id of
                 * the doc after it. If it is the last doc, it will be null.
                 */
                this.collections[collName][id] = msg.fields;

                var changedDoc = this.collections[collName][id];
                this._notifyWatchers(collName, changedDoc, id, msg.msg);
            },
            removed: function removed(msg) {
                var collName = msg.collection;
                var id = msg.id;
                var doc = this.collections[collName][id];

                delete this.collections[collName][id];
                this._notifyWatchers(collName, doc, id, msg.msg);
            },
            ready: function ready(_ref) {
                var _this = this;

                var subs = _ref.subs;

                subs.forEach(function (id) {
                    return _this.defs[id].resolve();
                });
            },
            nosub: function nosub(data) {
                if (data.error) {
                    var error = data.error;
                    this.defs[data.id].reject(error.reason || 'Subscription not found');
                } else {
                    this.defs[data.id].resolve();
                }
            },
            movedBefore: function movedBefore(data) {
                // TODO
            },
            ping: function ping(data) {
                var pong = { msg: 'pong' };
                if (data.hasOwnProperty('id')) {
                    pong.id = data.id;
                }
                this.send(pong);
            }
        };

        if (typeof uriOrSocket === 'string') {
            this.sock = new WebSocket(uriOrSocket);
        } else {
            this.sock = uriOrSocket;
        }

        var d = this._connectDeferred = new DDPClient.Deferred();

        this.sock.onerror = d.reject.bind(d);

        this.sock.onopen = function () {
            _this2.send({
                msg: 'connect',
                version: DDPClient.VERSIONS[0],
                support: DDPClient.VERSIONS
            });
        };

        this.sock.onmessage = function (wsMessage) {
            var data = JSON.parse(wsMessage.data);var msg = data.msg;

            if (msg === 'connected') {
                return d.resolve(data);
            } else if (msg) {
                var handler = _this2._messageHandlers[msg];
                if (!handler) {
                    console.warn('no handler for message', msg, data);
                    return;
                }
                handler.call(_this2, data);
            }
        };
    } // { coll_name => {docId => {doc}, docId => {doc}, ...} }

    // { pub_name => deferred_id }


    _createClass(DDPClient, [{
        key: '_notifyWatchers',
        value: function _notifyWatchers(collName, changedDoc, docId, message) {
            changedDoc = JSON.parse(JSON.stringify(changedDoc)); // make a copy
            changedDoc._id = docId; // id might be useful to watchers, attach it.

            if (!this.watchers[collName]) {
                this.watchers[collName] = [];
            }
            this.watchers[collName].forEach(function (fn) {
                return fn(changedDoc, message);
            });
        }
    }, {
        key: 'connect',
        value: function connect() {
            return this._connectDeferred.promise();
        }
    }, {
        key: '_deferredSend',
        value: function _deferredSend(actionType, name, params) {
            var id = this._ids.next();
            this.defs[id] = new DDPClient.Deferred();

            var args = params || [];

            var o = {
                msg: actionType,
                params: args,
                id: id
            };

            if (actionType === 'method') {
                o.method = name;
            } else if (actionType === 'sub') {
                o.name = name;
                this.subs[name] = id;
            }

            this.send(o);
            return this.defs[id].promise();
        }
    }, {
        key: 'call',
        value: function call(methodName) {
            for (var _len = arguments.length, params = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
                params[_key - 1] = arguments[_key];
            }

            return this._deferredSend('method', methodName, params);
        }
    }, {
        key: 'subscribe',
        value: function subscribe(pubName) {
            for (var _len2 = arguments.length, params = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                params[_key2 - 1] = arguments[_key2];
            }

            return this._deferredSend('sub', pubName, params);
        }
    }, {
        key: 'unsubscribe',
        value: function unsubscribe(pubName) {
            this.defs[id] = new DDPClient.Deferred();
            if (!this.subs[pubName]) {
                this.defs[id].reject(pubName + " was never subscribed");
            } else {
                var _id = this.subs[pubName];
                var o = {
                    msg: 'unsub',
                    id: _id
                };
                this.send(o);
            }
            return this.defs[id].promise();
        }
    }, {
        key: 'watch',
        value: function watch(collectionName, cb) {
            if (!this.watchers[collectionName]) {
                this.watchers[collectionName] = [];
            }
            this.watchers[collectionName].push(cb);
        }
    }, {
        key: 'getCollection',
        value: function getCollection(collectionName) {
            return this.collections[collectionName] || null;
        }
    }, {
        key: 'getDocument',
        value: function getDocument(collectionName, docId) {
            return this.collections[collectionName][docId] || null;
        }
    }, {
        key: 'send',
        value: function send(msg) {
            this.sock.send(JSON.stringify(msg));
        }
    }, {
        key: 'close',
        value: function close() {
            this.sock.close();
        }

        // -- helpers --

    }]);

    return DDPClient;
}();

DDPClient.VERSIONS = ['1', 'pre2', 'pre1'];

DDPClient.Deferred = function () {
    function _class() {
        var _this3 = this;

        _classCallCheck(this, _class);

        this._p = new Promise(function (resolve, reject) {
            _this3._resolve = resolve;
            _this3._reject = reject;
        });
    }

    _createClass(_class, [{
        key: 'reject',
        value: function reject() {
            return this._reject.apply(this, arguments);
        }
    }, {
        key: 'resolve',
        value: function resolve() {
            return this._resolve.apply(this, arguments);
        }
    }, {
        key: 'promise',
        value: function promise() {
            return this._p;
        }
    }]);

    return _class;
}();
