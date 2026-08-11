// Drop-in replacement for the Claude-artifact `window.storage` API, backed by
// the browser's localStorage. Same method shapes so App.jsx needs no rewiring
// beyond swapping the import.

const PREFIX = "invoice-app:";

function readAll() {
  try {
    const raw = localStorage.getItem(PREFIX + "__store");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function writeAll(store) {
  localStorage.setItem(PREFIX + "__store", JSON.stringify(store));
}

export const storage = {
  async get(key) {
    const store = readAll();
    if (!(key in store)) return null;
    return { key, value: store[key], shared: false };
  },

  async set(key, value) {
    const store = readAll();
    store[key] = value;
    writeAll(store);
    return { key, value, shared: false };
  },

  async delete(key) {
    const store = readAll();
    const existed = key in store;
    delete store[key];
    writeAll(store);
    return { key, deleted: existed, shared: false };
  },

  async list(prefix = "") {
    const store = readAll();
    const keys = Object.keys(store).filter((k) => k.startsWith(prefix));
    return { keys, prefix, shared: false };
  },
};
