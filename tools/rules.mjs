// The rules for an app's YAML: the same ones Pointview applies when someone
// adds the app (Pointview's src/appDescriptions.ts, parseDescription), plus
// the store's own optional lines (App Store design note, 27 Oct 2026):
//
//   about:    "…"            a paragraph for the store's details view, up to 1,000 characters
//   keywords: [chess, game]   up to 10 words for search
//   icon:     "icon.png"      the icon's file name, in the app's folder
//   group_home: true          the app can be a group's Home (group-as-an-app prototype)
//
// The two copies must agree: Pointview's tests run this file against the same
// examples. Messages are Pointview's own words, so an author sees here what
// Pointview would say.
//
// A built-in app (one Pointview draws itself: Google Drive, Video Call) has a
// short entry instead (pointview_builtin: 1), so the store can list it; its
// code and its real YAML stay in Pointview.

import { parseDocument, isScalar, Scalar } from 'yaml';

export const DESCRIPTION_MAX_BYTES = 16 * 1024;
const APP_ID = /^[a-z0-9]+(\.[a-z0-9][a-z0-9-]*)+$/;
const PROFILE = /^[a-z0-9]+(\.[a-z0-9][a-z0-9-]*)+$/;
const LONGEST_GROUP = 50;
export const MAX_SETTINGS = 10;
const SETTING_ID = /^[a-z][a-z0-9_]{0,31}$/;
const CHOICE_VALUE = /^[A-Za-z0-9_-]{1,32}$/;
const KEYWORD = /^[a-z0-9][a-z0-9-]{0,29}$/;
const ICON_FILE = /^[A-Za-z0-9_-]{1,60}\.png$/;
const BUILTIN_PATH = /^\/apps\/[a-z0-9-]{1,40}\/[A-Za-z0-9_-]{1,60}\.ya?ml$/;

/** An https address with a host and no user name or password, at most 500 characters. */
function httpsUrl(v) {
  if (typeof v !== 'string') return null;
  let u;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return null;
  return u.href.length <= 500 ? u.href : null;
}

/** Reads the YAML; returns { doc, d } or { error }. */
function read(text) {
  if (Buffer.byteLength(text, 'utf8') > DESCRIPTION_MAX_BYTES) return { error: 'the file is larger than 16 KB' };
  let doc;
  try {
    doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  } catch {
    return { error: 'the file is not YAML' };
  }
  if (doc.errors.length) return { error: 'the file is not valid YAML (' + doc.errors[0].message.split('\n')[0] + ')' };
  let data;
  try { data = doc.toJS({ maxAliasCount: 0 }); } catch { return { error: 'the file is not valid YAML' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'the file is not a set of keys' };
  return { doc, d: data };
}

/** Helpers over one document: is a value quoted, and quoted text of a length. */
function helpers(doc, d) {
  const quoted = (path) => {
    const node = doc.getIn(path, true);
    return isScalar(node) && (node.type === Scalar.QUOTE_DOUBLE || node.type === Scalar.QUOTE_SINGLE);
  };
  const text1 = (path, max, required) => {
    const v = path.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), d);
    if (v === undefined || v === null) return required ? false : null;
    if (typeof v !== 'string' || !quoted(path)) return false;
    const s = v.trim();
    return s.length >= 1 && [...s].length <= max ? s : false;
  };
  return { quoted, text1 };
}

/** The store's own lines, the same for an app and a built-in entry. */
function storeLines(d, text1) {
  const about = text1(['about'], 1000, false);
  if (about === false) return { error: 'about must be quoted text of up to 1000 characters' };
  let keywords = [];
  if (d.keywords !== undefined) {
    if (!Array.isArray(d.keywords) || d.keywords.length > 10 || !d.keywords.every((k) => typeof k === 'string' && KEYWORD.test(k))) {
      return { error: 'keywords must list up to 10 lower-case words (letters, digits, -)' };
    }
    keywords = d.keywords;
  }
  let icon = null;
  if (d.icon !== undefined) {
    if (typeof d.icon !== 'string' || !ICON_FILE.test(d.icon)) return { error: 'icon must be the name of a .png file in the app\'s folder' };
    icon = d.icon;
  }
  return { about: about || null, keywords, icon };
}

function fitsOf(d) {
  const fits = d.fits;
  if (!fits || typeof fits !== 'object') return { error: 'fits is required' };
  if (typeof fits.people !== 'boolean' || typeof fits.groups !== 'boolean') return { error: 'fits.people and fits.groups must be true or false' };
  if (!fits.people && !fits.groups) return { error: 'the app must fit people, groups or both' };
  const minMembers = fits.min_members ?? 2;
  const maxMembers = fits.max_members ?? LONGEST_GROUP;
  if (!Number.isInteger(minMembers) || !Number.isInteger(maxMembers) || minMembers < 2 || maxMembers < minMembers) {
    return { error: 'fits.min_members and fits.max_members must be whole numbers, at least 2, min no more than max' };
  }
  return { fits: { people: fits.people, groups: fits.groups, minMembers, maxMembers } };
}

/**
 * Checks an app's YAML as Pointview does. `launchBase`, if given, is the only
 * place its page may be (the app's own folder on GitHub Pages).
 * Returns { ok: true, app } or { ok: false, detail }.
 */
export function checkApp(text, { launchBase = null } = {}) {
  const r = read(text);
  if (r.error) return { ok: false, detail: r.error };
  const { doc, d } = r;
  const { quoted, text1 } = helpers(doc, d);
  const need = (detail) => ({ ok: false, detail });

  if (d.pointview_app !== 1) return need('pointview_app must be 1, the format version');
  if (typeof d.id !== 'string' || !APP_ID.test(d.id) || d.id.length > 100) return need('id must be a dotted name such as io.padi.chess');
  const name = text1(['name'], 40, true);
  if (!name) return need('name must be quoted text of up to 40 characters');
  const summary = text1(['summary'], 140, false);
  if (summary === false) return need('summary must be quoted text of up to 140 characters');
  const aiContext = text1(['ai_context'], 1000, false);
  if (aiContext === false) return need('ai_context must be quoted text of up to 1000 characters');
  const publisherName = text1(['publisher', 'name'], 60, true);
  if (!publisherName) return need('publisher.name must be quoted text of up to 60 characters');
  const contact = text1(['publisher', 'contact'], 100, false);
  if (contact === false) return need('publisher.contact must be quoted text of up to 100 characters');
  if (!quoted(['launch'])) return need('launch must be a quoted https address');
  // In the store an app's page is always a full address: there is no Pointview beside the file to be relative to.
  const launch = httpsUrl(d.launch);
  if (!launch) return need('launch must be a quoted https address');
  if (launchBase && !launch.startsWith(launchBase)) return need(`launch must be the app's own page, under ${launchBase}`);
  const notification = text1(['notification'], 40, false);
  if (notification === false) return need('notification must be quoted text of up to 40 characters');

  const f = fitsOf(d);
  if (f.error) return need(f.error);

  const list = d.connections;
  if (!Array.isArray(list) || !list.length || list.length > 10) return need('connections must list one to ten profiles');
  const connections = [];
  for (const c of list) {
    const profile = c?.profile;
    const role = c?.role;
    if (typeof profile !== 'string' || !PROFILE.test(profile) || profile.length > 120) return need('each connection needs a profile name such as padi.test.app.chess');
    if (role !== 'provider' && role !== 'consumer') return need('each connection\'s role must be provider or consumer');
    connections.push({ profile, role });
  }

  // Only Pointview's own apps may be shown by Pointview itself; none of the store's are.
  if (d.view !== undefined) return need('view is only for an app Pointview serves');
  if (d.shown_to !== undefined && d.shown_to !== 'everyone' && d.shown_to !== 'admins') return need('shown_to must be everyone or admins');
  const shownTo = d.shown_to === 'admins' ? 'admins' : 'everyone';
  if (d.group_home !== undefined && typeof d.group_home !== 'boolean') return need('group_home must be true or false');

  const settings = [];
  if (d.settings !== undefined) {
    if (!Array.isArray(d.settings) || d.settings.length > MAX_SETTINGS) return need(`settings must list up to ${MAX_SETTINGS} settings`);
    const ids = new Set();
    for (let i = 0; i < d.settings.length; i++) {
      const x = d.settings[i];
      const at = `settings[${i + 1}]`;
      if (!x || typeof x !== 'object') return need(`${at} must be a set of keys`);
      if (typeof x.id !== 'string' || !SETTING_ID.test(x.id) || ids.has(x.id)) return need(`${at}.id must be a short lower-case name (letters, digits, _), different for each setting`);
      ids.add(x.id);
      const label = text1(['settings', i, 'label'], 40, true);
      if (!label) return need(`${at}.label must be quoted text of up to 40 characters`);
      const help = text1(['settings', i, 'help'], 140, false);
      if (help === false) return need(`${at}.help must be quoted text of up to 140 characters`);
      const base = { id: x.id, label, help: help || null };
      if (x.type === 'choice') {
        const cl = x.choices;
        if (!Array.isArray(cl) || cl.length < 2 || cl.length > 10) return need(`${at}.choices must list two to ten choices`);
        const choices = [];
        for (let j = 0; j < cl.length; j++) {
          const value = cl[j]?.value;
          if (typeof value !== 'string' || !CHOICE_VALUE.test(value) || choices.some((o) => o.value === value)) {
            return need(`${at}.choices[${j + 1}].value must be a short name (letters, digits, - or _), different for each choice`);
          }
          const l = text1(['settings', i, 'choices', j, 'label'], 60, true);
          if (!l) return need(`${at}.choices[${j + 1}].label must be quoted text of up to 60 characters`);
          choices.push({ value, label: l });
        }
        const def = x.default ?? choices[0].value;
        if (typeof def !== 'string' || !choices.some((o) => o.value === def)) return need(`${at}.default must be one of its choices' values`);
        settings.push({ ...base, type: 'choice', choices, default: def });
      } else if (x.type === 'toggle') {
        const def = x.default ?? false;
        if (typeof def !== 'boolean') return need(`${at}.default must be true or false`);
        settings.push({ ...base, type: 'toggle', default: def });
      } else if (x.type === 'text') {
        const max = x.max ?? 100;
        if (!Number.isInteger(max) || max < 1 || max > 500) return need(`${at}.max must be a whole number from 1 to 500`);
        let def = '';
        if (x.default !== undefined && x.default !== null) {
          const t = text1(['settings', i, 'default'], max, false);
          if (t === false) return need(`${at}.default must be quoted text of up to ${max} characters`);
          def = t ?? '';
        }
        settings.push({ ...base, type: 'text', max, default: def });
      } else {
        return need(`${at}.type must be choice, toggle or text`);
      }
    }
  }

  const store = storeLines(d, text1);
  if (store.error) return need(store.error);
  return {
    ok: true,
    app: {
      id: d.id, name, summary: summary || null, about: store.about, keywords: store.keywords, icon: store.icon,
      publisher: { name: publisherName, contact: contact || null },
      launch, notification: notification || null, fits: f.fits, connections, shownTo,
      groupHome: d.group_home === true, settings, aiContext: aiContext || null,
    },
  };
}

/**
 * Checks a built-in app's store entry: what the store shows, and where its
 * real YAML is on every Pointview (`path`, such as /apps/call/call.yaml).
 */
export function checkBuiltIn(text) {
  const r = read(text);
  if (r.error) return { ok: false, detail: r.error };
  const { doc, d } = r;
  const { text1 } = helpers(doc, d);
  const need = (detail) => ({ ok: false, detail });
  if (d.pointview_builtin !== 1) return need('pointview_builtin must be 1, the format version');
  if (typeof d.id !== 'string' || !APP_ID.test(d.id) || d.id.length > 100) return need('id must be a dotted name such as io.padi.call');
  const name = text1(['name'], 40, true);
  if (!name) return need('name must be quoted text of up to 40 characters');
  const summary = text1(['summary'], 140, false);
  if (summary === false) return need('summary must be quoted text of up to 140 characters');
  const publisherName = text1(['publisher', 'name'], 60, true);
  if (!publisherName) return need('publisher.name must be quoted text of up to 60 characters');
  const contact = text1(['publisher', 'contact'], 100, false);
  if (contact === false) return need('publisher.contact must be quoted text of up to 100 characters');
  if (typeof d.path !== 'string' || !BUILTIN_PATH.test(d.path)) return need('path must be where Pointview serves the app\'s YAML, such as /apps/call/call.yaml');
  const f = fitsOf(d);
  if (f.error) return need(f.error);
  const store = storeLines(d, text1);
  if (store.error) return need(store.error);
  return {
    ok: true,
    app: {
      id: d.id, name, summary: summary || null, about: store.about, keywords: store.keywords, icon: store.icon,
      publisher: { name: publisherName, contact: contact || null }, path: d.path, fits: f.fits,
    },
  };
}
