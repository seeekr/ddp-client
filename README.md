ddp-client
==========

A modern JS client for Meteor's DDP. Promise-based. Pluggable WebSocket implementation.

Forked from [nbento/meteor-ddp](https://github.com/nbento/meteor-ddp) / [eddflrs/meteor-ddp](https://github.com/eddflrs/meteor-ddp) with the goal of modernizing the source and supporting pluggable websocket implementations like [ReconnectingWebSocket](https://github.com/joewalnes/reconnecting-websocket).

## Differences to original implementation
* Additional arguments to `call()` and `subscribe()` don't need to be placed in an array, but are passed varargs style.
* Returned Promises align with standard ES6 Promise spec, i.e. have methods `then` and `catch` instead of `fail` and `success` when relying on $.Deferred.
* Passing an alternative WebSocket implementation is possible, for example to add reconnection behavior. See constructor example below.
* All code is modern ES6 with a sprinkle of ES7.
* No Oauth support. (If anyone needs that, feel free to send a PR with modern rewrite of original source.)
* Ability to turn off client side collections. Useful when using DDP for easy message passing between server and client.

Dependencies
--------------------
* a `Promise` implementation can be provided by [babel-polyfill](https://www.npmjs.com/package/babel-polyfill), so when in doubt check and/or include that in your build.


Methods
------------

All methods return promises if it makes sense and not specified otherwise.

* **constructor(ws, opts)**
```js
// using ws url
const ddp = new DDPClient('ws://yourApp.meteor.com/websocket')
// using particular ws impl
const ddp = new DDPClient(new ReconnectingWebSocket('ws://yourApp.meteor.com/websocket'))
```

### Options
```js
{
    // turns off/on tracking collection documents locally
    // beware that watchers may not get the same data passed in depending on this setting
    // default: true (collection tracking on)
    collections: false
}
```

* **connect()**

```js
ddp.connect().then(() => {
  console.log('Connected!')
})
```
  
* **call(methodName, param1, ...)** - Does a Remote Procedure Call on any method exposed through `Meteor.methods` on the server.

```js
ddp.call('ping', 123, 234).then(res => console.log(res))
```

* **subscribe(subscriptionName, param1, ...)** - Subscribes to data published on the server. You can observe changes on a collection by using the 'watch' method. Returned promise is resolved when subscription is ready.

* **unsubscribe(subscriptionName)** - Unsubscribes to data published on the server. Leaves local collection intact.

* **watch(collectionName, callback)** - Observe a collection and be notified whenever that collection changes via your callback. A copy of the modified document will be sent as argument to the callback. Returns nothing.

```js
ddp.watch('players', (changedDoc, message) => {
  console.log('players collection item changed', changedDoc, message)

  // Was it removed?
  if (message === 'removed') {
    console.log('document removed from local collection!')
  }
})
```

* **getCollection(collectionName)** - *Returns -> An Object containing the locally stored collection.*

```js
ddp.getCollection('rooms') // -> {id1: {document1}, id2: {document2}, ...}
```

* **getDocument(collectionName, documentId)** - *Returns -> The document with specified documentId belonging to collectionName.*

```js
ddp.getDocument('rooms', '4ec81e1b-2e16-42f4-a915-cc18ad7bdb0c') // -> {document}
```

* **close()** - Closes the WebSocket connection.

# No Oauth support

There is no Oauth support in this release. I do not need it and as such did not invest the effort to bring that code up to date as well.

# Acknowledgements

Thanks to [Eddie Flores](https://github.com/eddflrs) and [nbento](https://github.com/nbento) for the original code!
