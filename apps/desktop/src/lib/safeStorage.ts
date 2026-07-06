function storageWarn(action: string, key: string, error: unknown) {
  console.warn(`[TASK][storage:${action}] ${key}`, error);
}

export function safeLocalStorageGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch (error) {
    storageWarn("get", key, error);
    return null;
  }
}

export function safeLocalStorageSet(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch (error) {
    storageWarn("set", key, error);
  }
}

export function safeLocalStorageGetWithLegacy(key: string, legacyKey: string): string | null {
  const current = safeLocalStorageGet(key);
  if (current !== null) return current;

  const legacy = safeLocalStorageGet(legacyKey);
  if (legacy !== null) {
    safeLocalStorageSet(key, legacy);
  }
  return legacy;
}

export function safeLocalStorageRemove(key: string) {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch (error) {
    storageWarn("remove", key, error);
  }
}
