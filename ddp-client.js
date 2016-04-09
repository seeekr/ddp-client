class DDPClient {
    static VERSIONS = ['1', 'pre2', 'pre1']
    sock = null
    defs = {}         // { deferred_id => deferred_object }
    subs = {}         // { pub_name => deferred_id }
    watchers = {}     // { coll_name => [cb1, cb2, ...] }
    collections = {}  // { coll_name => {docId => {doc}, docId => {doc}, ...} }
    _trackCollections = true

    _connectDeferred = null

    constructor(uriOrSocket, {collections} = {}) {
        // process opts first so we're ready before connecting
        if (collections === false) {
            this._trackCollections = false
        }

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
                const handler = this['_on' + msg]
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

    // -- message handlers --
    _onresult (data) {
        if (data.error) {
            this.defs[data.id].reject(data.error.reason)
        } else if (typeof data.result !== 'undefined') {
            this.defs[data.id].resolve(data.result)
        }
    }
    _onupdated(msg) {
        // TODO method call was acked
    }
    _onchanged({collection, id, fields, cleared, msg}) {
        let doc
        if (this._trackCollections) {
            doc = this.collections[collection][id]
            if (fields) { Object.assign(doc, fields) }
            if (cleared) { cleared.forEach(field => delete doc[field]) }
        } else {
            doc = fields
        }

        this._notifyWatchers(collection, doc, id, msg)
    }
    _onadded({collection, id, fields, msg}) {
        if (this._trackCollections) {
            this.collections[collection] = this.collections[collection] || {}
            this.collections[collection][id] = fields
        }

        this._notifyWatchers(collection, fields, id, msg)
    }
    _onremoved({collection, id, msg}) {
        let doc = null
        if (this._trackCollections) {
            doc = this.collections[collection][id]
            delete this.collections[collection][id]
        }
        this._notifyWatchers(collection, doc, id, msg)
    }
    _onready({subs}) {
        subs.forEach(id => this.defs[id].resolve())
    }
    _onnosub({error, id}) {
        if (error) {
            this.defs[id].reject(error.reason || 'Subscription not found')
        } else {
            this.defs[id].resolve()
        }
    }
    _onmovedBefore(data) {
        // TODO
    }
    _onping({id}) {
        const pong = {msg: 'pong'}
        if (id !== undefined) { pong.id = id }
        this.send(pong)
    }
    // -- END message handlers--

    _notifyWatchers(collName, doc, docId, message) {
        doc = Object.assign({}, doc) // make a copy
        doc._id = docId // id might be useful to watchers, attach it.

        if (!this.watchers[collName]) {
            this.watchers[collName] = []
        }
        this.watchers[collName].forEach(fn => fn(doc, message))
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
        if (!this._trackCollections) { return null }
        return this.collections[collectionName]
    }

    getDocument(collectionName, docId) {
        if (!this._trackCollections) { return null }
        return this.collections[collectionName][docId]
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
