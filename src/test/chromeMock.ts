export interface ChromeMock {
  store: Record<string, unknown>;
  reset(): void;
}

export function installChromeMock(): ChromeMock {
  const store: Record<string, unknown> = {};

  const local = {
    async get(keys?: string | string[] | null) {
      if (keys == null) return { ...store };
      const list = typeof keys === 'string' ? [keys] : keys;
      const out: Record<string, unknown> = {};
      for (const key of list) if (key in store) out[key] = store[key];
      return out;
    },
    async set(items: Record<string, unknown>) {
      Object.assign(store, items);
    },
    async clear() {
      for (const key of Object.keys(store)) delete store[key];
    },
  };

  const sync = {
    async set() {
      throw new Error('chrome.storage.sync must never be used — it would leak the API key');
    },
    async get() {
      throw new Error('chrome.storage.sync must never be used — it would leak the API key');
    },
  };

  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local, sync },
    runtime: { id: 'test-extension' },
  };

  return {
    store,
    reset() {
      for (const key of Object.keys(store)) delete store[key];
    },
  };
}
