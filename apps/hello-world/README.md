# Hello World: your first connection

Two apps, the two sides of one Connection Profile. The **Initiator** says
hello; the **Responder** answers. Between them they show everything an app
needs to use CNS/CP in Pointview, in a few dozen lines of code each, most of them showing people what is happening.

## The profile

[`hello.world`](https://cp.cnscp.io/hello.world) is published on the CNS/CP
Registry by Padi. It has two sides and one property each:

| Side | Called | Writes | Propagates |
| --- | --- | --- | --- |
| provider | Initiator | `message` | yes: one value goes to every connection |
| consumer | Responder | `response` | no: written on one connection at a time |

Pointview reads the profile from the Registry the first time an app names it,
and keeps a copy. Your own profile works the same way: publish it, name it in
your YAML, and Pointview knows which side writes what.

## The YAML ties the app to a side

```yaml
connections:
  - profile: "hello.world"
    role: provider        # responder.yaml says consumer
```

That's the only place the role appears. The code never names it.

## The code follows four calls

From `initiator.js`:

```js
import { profile } from '../../sdk/pointview.js';

const hello = profile('hello.world');            // 1. take the side the YAML names
await hello.set('message', 'Hello world');       // 2. propagates: reaches every Responder
hello.onChange((view) => {                       // 3. on any change
  for (const c of view.connections) { ... }      //    one entry per Responder: c.peer, c.values.response
});
```

From `responder.js`, the fourth:

```js
await c.set('response', 'Hello Anto');           // 4. doesn't propagate: reaches that one Initiator
```

`set` on the profile is for properties that propagate; `set` on a connection
is for those that don't. Pointview refuses the other way round, so a mistake
shows at once.

What each entry in `view.connections` holds:

| | |
| --- | --- |
| `peer` | `{ id, name }`: who is at the other end, as this app knows them |
| `values` | the other end's values, opened on your device |
| `mine` | what you wrote on this connection |
| `state` | `ready`, or `waiting` while the other end's key hasn't arrived |
| `set(property, value)` | write on this connection only |

`view.problem` says what went wrong, if anything did.

## What you don't do

The app never names a realm, a context, a node, a role or a key. Pointview
declares your end in the conversation's context, the realm connects every
Initiator there with every Responder, and every value is sealed on your device
before it leaves it. In a two-person conversation that's one hello and one
reply. In a group, one Initiator hears from every Responder and a Responder
answers each Initiator on its own, with the same code.

## Showing it to people

`code.html` in this folder shows both scripts side by side, with the CNS/CP
lines highlighted. It reads the files the apps run, so it never goes out of
date. Add its address as a tile:
`https://padiinc.github.io/pointview-apps/apps/hello-world/code.html`

## Try it

Add both apps to a conversation from the store. Open the Initiator yourself
and ask someone else to open the Responder, or open the Responder in a second
browser signed in as someone else in that conversation.

One thing to know when you write your own: an app's frame doesn't allow form
submission, so use a button's `click`, not a form's `submit`.

## The library

`sdk/pointview.js` at the top of this repository wraps Pointview's messages
(`ready`, `hello`, `claim`, `connection`, `set`) in these calls. Load it from
beside your app as here; the messages themselves are in
[POINTVIEW.md](https://pointview.com/POINTVIEW.md) if you'd rather use them
directly.
