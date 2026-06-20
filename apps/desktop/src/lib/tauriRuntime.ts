export function isTauriRuntime(globalObject: Record<string, unknown> = globalThis as Record<string, unknown>): boolean {
  if (globalObject && (globalObject.__TAURI_INTERNALS__ || globalObject.__TAURI__)) {
    return true;
  }
  if (typeof window === "undefined") return false;
  const win = window as any;
  return Boolean(win.__TAURI_INTERNALS__ || win.__TAURI__ || win.__TAURI_METADATA__ || (win.navigator && win.navigator.userAgent && win.navigator.userAgent.includes("Tauri")));
}
