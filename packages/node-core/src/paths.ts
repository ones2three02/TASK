import { homedir, platform } from "node:os";
import { join } from "node:path";

export function appDataDir(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "com.task.app");
    case "win32":
      return join(process.env.APPDATA || join(home, "AppData", "Roaming"), "com.task.app");
    default:
      return join(home, ".config", "com.task.app");
  }
}

export function dbPath(): string {
  return join(appDataDir(), "task.db");
}

export function bridgePortFilePath(): string {
  return join(appDataDir(), "mcp-bridge-port");
}
