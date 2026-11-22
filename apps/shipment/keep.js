// Where each end keeps its own records: this browser's storage, under this
// app's own address. Pointview gives an app no private store, and its shared
// one (app states) goes to everyone in the group, which is the opposite of
// what a carrier's shipment list should do. So these apps ask for
// `frame: own_origin` in their YAML and keep their records here.
//
// One record per person per group: the key carries the id Pointview made for
// this person in this app in this conversation, so two accounts in one
// browser never see each other's.

/** Opens the record under `name`. `load()` gives the saved data or null; `save(data)` keeps it; `kept` is false if this browser won't keep anything. */
export function keep(name) {
  const key = 'pv-shipment:' + name;
  let memory = null;
  let kept = true;
  try {
    localStorage.setItem(key + ':probe', '1');
    localStorage.removeItem(key + ':probe');
  } catch {
    kept = false;
  }
  return {
    get kept() { return kept; },
    load() {
      if (!kept) return memory;
      try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
    },
    save(data) {
      memory = data;
      if (!kept) return;
      try { localStorage.setItem(key, JSON.stringify(data)); } catch { kept = false; }
    },
  };
}
