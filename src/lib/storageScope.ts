/**
 * Scope localStorage keys by authenticated user id so demo/cache data
 * from one account cannot leak into another on the same browser.
 */

const GLOBAL_PREFIX = 'orderflow';

let activeUserScope: string | null = null;

export function setStorageUserScope(userId: string | null | undefined): void {
  activeUserScope = userId && String(userId).trim() ? String(userId).trim() : null;
}

export function getStorageUserScope(): string | null {
  return activeUserScope;
}

/** Build a scoped key: orderflow:<userId>:<name> or orderflow:anon:<name> */
export function scopedStorageKey(name: string): string {
  const scope = activeUserScope || 'anon';
  return `${GLOBAL_PREFIX}:${scope}:${name}`;
}

export function readScopedJson<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(scopedStorageKey(name));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeScopedJson(name: string, value: unknown): void {
  try {
    localStorage.setItem(scopedStorageKey(name), JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function clearScopedStorage(name: string): void {
  try {
    localStorage.removeItem(scopedStorageKey(name));
  } catch {
    /* ignore */
  }
}

/** Clear all orderflow keys for the current scope (logout). */
export function clearCurrentUserScope(): void {
  try {
    const prefix = `${GLOBAL_PREFIX}:${activeUserScope || 'anon'}:`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
