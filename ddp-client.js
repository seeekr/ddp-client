class DDPClient {
    static VERSIONS = ['1', 'pre2', 'pre1']
    sock = null
    defs = {}         // { deferred_id => deferred_object }
    subs = {}         // { pub_name => deferred_id }
    watchers = {}     // { coll_name => [cb1, cb2, ...] }
    collections = {}  // { coll_name => {docId => {doc}, docId => {doc}, ...} }

    _connectDeferred = null

    constructor(uriOrSocket) {
        if (typeof uriOrSocket === 'string') {
            this.sock = new WebSocket(uriOrSocket)
        } else {
            this.sock = uriOrSocket
        }

        const d = this._connectDeferred = new DDPClient.Deferred()

        this.sock.onerror = ::d.reject

        this.sock.onopen = () => {
            this.send({
                msg: 'connect',
                version: DDPClient.VERSIONS[0],
                support: DDPClient.VERSIONS
            })
        }

        this.sock.onmessage = (wsMessage) => {
            const data = JSON.parse(wsMessage.data), {msg} = data
            if (msg === 'connected') {
                return d.resolve(data)
            } else if (msg) {
                const handler = this._messageHandlers[msg]
                if (!handler) {
                    console.warn('no handler for message', msg, data)
                    return
                }
                this::handler(data)
            }
        }
    }

    _ids = {
        count: 0,
        next() {
            return String(++this.count)
        }
    }

    _messageHandlers = {
        result (data) {
            if (data.error) {
                this.defs[data.id].reject(data.error.reason)
            } else if (typeof data.result !== 'undefined') {
                this.defs[data.id].resolve(data.result)
            }
        },
        updated(msg) {
            // TODO method call was acked
        },
        changed(msg) {
            const {collection, id, fields, cleared} = msg
            const coll = this.collections[collection]

            if (fields) {
                Object.assign(coll[id], fields)
            } else if (cleared) {
                for (let i = 0; i < cleared.length; i++) {
                    const fieldName = cleared[i]
                    delete coll[id][fieldName]
                }
            }

            const changedDoc = coll[id]
            this._notifyWatchers(collection, changedDoc, id, msg.msg)
        },
        added(msg) {
            const collName = msg.collection
            const id = msg.id
            if (!this.collections[collName]) {
                this.collections[collName] = {}
            }
            /* NOTE: Ordered docs will have a 'before' field containing the id of
             * the doc after it. If it is the last doc, it will be null.
             */
            this.collections[collName][id] = msg.fields

            const changedDoc = this.collections[collName][id]
            this._notifyWatchers(collName, changedDoc, id, msg.msg)
        },
        removed(msg) {
            const collName = msg.collection
            const id = msg.id
            const doc = this.collections[collName][id]

            delete this.collections[collName][id]
            this._notifyWatchers(collName, doc, id, msg.msg)
        },
        ready({subs}) {
            subs.forEach(id => this.defs[id].resolve())
        },
        nosub(data) {
            if (data.error) {
                const error = data.error
                this.defs[data.id].reject(error.reason || 'Subscription not found')
            } else {
                this.defs[data.id].resolve()
            }
        },
        movedBefore(data) {
            // TODO
        },
        ping(data) {
            const pong = {msg: 'pong'}
            if (data.hasOwnProperty('id')) {
                pong.id = data.id
            }
            this.send(pong)
        },
    }

    _notifyWatchers(collName, changedDoc, docId, message) {
        changedDoc = JSON.parse(JSON.stringify(changedDoc)) // make a copy
        changedDoc._id = docId // id might be useful to watchers, attach it.

        if (!this.watchers[collName]) {
            this.watchers[collName] = []
        }
        this.watchers[collName].forEach(fn => fn(changedDoc, message))
    }

    connect() {
        return this._connectDeferred.promise()
    }


    _deferredSend(actionType, name, params) {
        const id = this._ids.next()
        this.defs[id] = new DDPClient.Deferred()

        const args = params || []

        const o = {
            msg: actionType,
            params: args,
            id: id
        }

        if (actionType === 'method') {
            o.method = name
        } else if (actionType === 'sub') {
            o.name = name
            this.subs[name] = id
        }

        this.send(o)
        return this.defs[id].promise()
    }

    call(methodName, ...params) {
        return this._deferredSend('method', methodName, params)
    }

    subscribe(pubName, ...params) {
        return this._deferredSend('sub', pubName, params)
    }

    unsubscribe(pubName) {
        this.defs[id] = new DDPClient.Deferred()
        if (!this.subs[pubName]) {
            this.defs[id].reject(pubName + " was never subscribed")
        } else {
            const id = this.subs[pubName]
            const o = {
                msg: 'unsub',
                id: id
            }
            this.send(o)
        }
        return this.defs[id].promise()
    }

    watch(collectionName, cb) {
        if (!this.watchers[collectionName]) {
            this.watchers[collectionName] = []
        }
        this.watchers[collectionName].push(cb)
    }

    getCollection(collectionName) {
        return this.collections[collectionName] || null
    }

    getDocument(collectionName, docId) {
        return this.collections[collectionName][docId] || null
    }

    send(msg) {
        this.sock.send(JSON.stringify(msg))
    }

    close() {
        this.sock.close()
    }

    // -- helpers --

    static Deferred = class {
        constructor() {
            this._p = new Promise((resolve, reject) => {
                this._resolve = resolve
                this._reject = reject
            })
        }

        reject() {
            return this._reject(...arguments)
        }

        resolve() {
            return this._resolve(...arguments)
        }

        promise() {
            return this._p
        }
    }
}
