# Pointview apps

The apps you can add to a [Pointview](https://pointview.com) group or
conversation. Each app has a folder here. GitHub checks every app on each pull
request, and on each merge it publishes the apps and one list of them,
[`index.json`](https://padiinc.github.io/pointview-apps/index.json), on GitHub
Pages. Pointview's Add dialog reads that list, so a new app appears in every
Pointview as soon as it's merged, without a Pointview release.

| App | Folder | What it is |
| --- | --- | --- |
| Chess | [`apps/chess`](apps/chess) | A game of chess between two people. |
| Light and Switch | [`apps/light`](apps/light) | The two ends of the `padi.light` Connection Profile: Switches turn Lights on and off. |
| Hello | [`apps/hello`](apps/hello) | The first app a group can have as its Home: it says hello, by name. |
| Video call | [`apps/call`](apps/call) | Listed here; built into Pointview. |
| Google Drive | [`apps/drive`](apps/drive) | Listed here; built into Pointview. |
| Template | [`apps/template`](apps/template) | A working sample to copy. Not listed in the store. |

## How an app works in Pointview

An app is a web page that Pointview shows in a sandboxed frame on a group's
or conversation's home page. The page has no cookies, no storage and no
network beyond its own files. It talks only to Pointview, by messages:

- it says `ready`, and Pointview answers `hello` with who's here, the app's
  saved states and its settings;
- it saves a new state for everyone with `put`; Pointview seals it,
  end-to-end encrypted, into the conversation and hands it to everyone's copy
  of the app.

The app's YAML file tells Pointview its name, where its page is, what kind
of conversation it suits, and which Connection Profiles it uses. Pointview
gives an app only what its profiles allow. The full details are in
[POINTVIEW.md](https://pointview.com/POINTVIEW.md).

## Adding your app, step by step

1. **Fork this repository** and make a branch.
2. **Copy the template:** copy `apps/template` to `apps/<your-app>`, using a
   short lower-case name (letters, digits, `-`).
3. **Make the page yours:** `index.html`, `app.js` and `style.css`. Keep it
   static: only files in your folder, no outside scripts, fonts or images.
   Keep the `Content-Security-Policy` line at the top of `index.html`.
4. **Fill in the YAML** (`pointview-app.yaml`): every line marked `CHANGE`.
   - `id` is a dotted name you own, such as `com.yourcompany.yourapp`.
   - `launch` is your page on these Pages:
     `https://padiinc.github.io/pointview-apps/apps/<your-app>/`.
   - Free text goes in double quotes.
5. **Add an icon:** a square PNG of at least 128 pixels, named in `icon:`.
6. **Check it:** `npm install`, then `npm run check`. It applies the same
   rules Pointview does, and says what's wrong in plain words.
7. **Try it:** `npm run build`, then serve the `site/` folder and open your
   page. The template shows the messages to send and handle.
8. **Open a pull request.** The check runs on it. Once Padi has reviewed and
   merged it, your app is in the store.

## The YAML, in short

| Key | Required | What |
| --- | --- | --- |
| `pointview_app` | yes | Always `1`. |
| `id` | yes | A dotted name, such as `io.padi.chess`. |
| `name` | yes | Up to 40 characters, quoted. |
| `summary` | no | One line, up to 140 characters, quoted. |
| `about` | no | The store's paragraph, up to 1,000 characters, quoted. |
| `keywords` | no | Up to 10 lower-case words, for search. |
| `icon` | no | A square PNG in the folder, at least 128 pixels. |
| `publisher.name`, `publisher.contact` | name yes | Who made it, and where to reach them. |
| `launch` | yes | The app's page, a full https address in its own folder here. |
| `notification` | no | What a notification says when the app wakes someone, up to 40 characters. |
| `fits` | yes | `people` (two-person conversations) and `groups`, each true or false; `min_members` and `max_members` optional. |
| `connections` | yes | One to ten `{ profile, role }`, role `consumer` or `provider`. |
| `settings` | no | Up to 10 settings an admin chooses for the tile: `choice`, `toggle` or `text`. |
| `shown_to` | no | `everyone` (the default) or `admins`. |
| `ai_context` | no | What the app's state means, for the conversation's AI. |
| `group_home` | no | `true` if the app can be a group's Home. |

## The two built-in apps

Video call and Google Drive are drawn by Pointview itself: one needs the camera
and microphone, the other Google's own page. Neither can run in a sandboxed
frame. Their code stays in Pointview; their folders here hold only a short
entry (`builtin.yaml`) so the store can list them.

## The tools

- `tools/rules.mjs`: the YAML rules, the same as Pointview's
  (`src/appDescriptions.ts`). `tools/examples/` holds shared cases that both
  must answer the same way.
- `tools/check.mjs`: checks every app (`npm run check`).
- `tools/build-index.mjs`: builds what Pages publishes (`npm run build`).
- `npm test`: the tools' own tests.
