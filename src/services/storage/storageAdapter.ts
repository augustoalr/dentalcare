/**
 * Agnostic key-value storage contract so UI and domain never couple directly
 * to `window.localStorage` or any specific persistence mechanism.
 */
export interface IStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Safe browser `localStorage` wrapper that degrades gracefully when storage is
 * unavailable (e.g. restricted private mode or non-browser environments).
 */
export class BrowserStorageAdapter implements IStorageAdapter {
  private readonly storage: Storage | null;

  constructor(storage?: Storage | null) {
    if (storage !== undefined) {
      this.storage = storage;
      return;
    }

    try {
      this.storage = typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      this.storage = null;
    }
  }

  getItem(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // Ignore quota or security errors when storage is blocked
    }
  }

  removeItem(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      // Ignore errors when storage is blocked
    }
  }
}

/**
 * Deterministic in-memory adapter for unit and component tests.
 */
export class InMemoryStorageAdapter implements IStorageAdapter {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}
