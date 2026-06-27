import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

export interface SyncLog {
  id: string;
  time: string;
  type: "info" | "success" | "error";
  message: string;
}

export const useOfficeStore = defineStore("office", () => {
  const larkInstalled = ref(false);
  const dwsInstalled = ref(false);
  const larkInstalling = ref(false);
  const dwsInstalling = ref(false);

  const larkConnected = ref(false);
  const dwsConnected = ref(false);

  const larkUsername = ref("");
  const dwsUsername = ref("");

  const syncLogs = ref<SyncLog[]>([]);

  function addLog(type: "info" | "success" | "error", message: string) {
    syncLogs.value.unshift({
      id: Math.random().toString(36).slice(2),
      time: new Date().toLocaleTimeString(),
      type,
      message,
    });
  }

  // 1. Run commands via Tauri Rust command
  async function runCli(cmd: string, args: string[]): Promise<string> {
    try {
      return await invoke<string>("run_office_cli", { cmd, args });
    } catch (e: any) {
      throw new Error(e?.message || String(e));
    }
  }

  // 2. Check Installations
  async function checkLarkInstall() {
    try {
      const res = await runCli("lark", ["--version"]);
      larkInstalled.value = !!res;
      return true;
    } catch {
      larkInstalled.value = false;
      return false;
    }
  }

  async function checkDwsInstall() {
    try {
      const res = await runCli("dws", ["--version"]);
      dwsInstalled.value = !!res;
      return true;
    } catch {
      dwsInstalled.value = false;
      return false;
    }
  }

  // 3. Check Connection / Login Status
  async function checkLarkStatus() {
    if (!larkInstalled.value) return;
    try {
      // Lark-cli uses "lark status" or "lark auth info" to retrieve user state
      const res = await runCli("lark", ["status"]);
      if (res && !res.toLowerCase().includes("not logged in") && !res.toLowerCase().includes("error")) {
        larkConnected.value = true;
        // Parse username from lark status output if possible, else default
        const match = res.match(/(?:Username|User|Name):\s*([^\n]+)/i);
        larkUsername.value = match ? match[1].trim() : "飞书企业用户";
      } else {
        larkConnected.value = false;
        larkUsername.value = "";
      }
    } catch {
      larkConnected.value = false;
      larkUsername.value = "";
    }
  }

  async function checkDwsStatus() {
    if (!dwsInstalled.value) return;
    try {
      // Dingtalk workspace cli uses "dws status" or "dws user"
      const res = await runCli("dws", ["status"]);
      if (res && !res.toLowerCase().includes("not logged in") && !res.toLowerCase().includes("error")) {
        dwsConnected.value = true;
        const match = res.match(/(?:Username|User|Name):\s*([^\n]+)/i);
        dwsUsername.value = match ? match[1].trim() : "钉钉工作用户";
      } else {
        dwsConnected.value = false;
        dwsUsername.value = "";
      }
    } catch {
      dwsConnected.value = false;
      dwsUsername.value = "";
    }
  }

  // 4. Trigger logins (returns OAuth Link to show on frontend)
  async function getLarkLoginUrl(): Promise<string> {
    try {
      // Run login command, lark login usually prints authentication link
      const res = await runCli("lark", ["login"]);
      const match = res.match(/(https?:\/\/[^\s]+)/g);
      if (match && match.length > 0) {
        return match[0];
      }
      return "";
    } catch (err: any) {
      throw new Error(`无法获取飞书授权地址: ${err.message}`);
    }
  }

  async function getDwsLoginUrl(): Promise<string> {
    try {
      const res = await runCli("dws", ["login"]);
      const match = res.match(/(https?:\/\/[^\s]+)/g);
      if (match && match.length > 0) {
        return match[0];
      }
      return "";
    } catch (err: any) {
      throw new Error(`无法获取钉钉授权地址: ${err.message}`);
    }
  }

  // 5. Force logout
  async function logoutLark() {
    try {
      await runCli("lark", ["logout"]);
      larkConnected.value = false;
      larkUsername.value = "";
      addLog("info", "飞书账号已登出");
    } catch (e: any) {
      addLog("error", `登出飞书失败: ${e.message}`);
    }
  }

  async function logoutDws() {
    try {
      await runCli("dws", ["logout"]);
      dwsConnected.value = false;
      dwsUsername.value = "";
      addLog("info", "钉钉账号已登出");
    } catch (e: any) {
      addLog("error", `登出钉钉失败: ${e.message}`);
    }
  }

  // 6. One-click installations via Volta
  async function installLarkCli() {
    if (larkInstalling.value) return;
    larkInstalling.value = true;
    addLog("info", "开始自动安装 @larksuite/cli (通过 Volta)...");
    try {
      await runCli("volta", ["install", "@larksuite/cli"]);
      addLog("success", "飞书 lark-cli 全局安装成功！");
      await checkLarkInstall();
      await checkLarkStatus();
    } catch (e: any) {
      addLog("error", `安装 @larksuite/cli 失败: ${e.message}`);
      throw e;
    } finally {
      larkInstalling.value = false;
    }
  }

  async function installDwsCli() {
    if (dwsInstalling.value) return;
    dwsInstalling.value = true;
    addLog("info", "开始自动安装 dingtalk-workspace-cli (通过 Volta)...");
    try {
      await runCli("volta", ["install", "dingtalk-workspace-cli"]);
      addLog("success", "钉钉 dws 全局安装成功！");
      await checkDwsInstall();
      await checkDwsStatus();
    } catch (e: any) {
      addLog("error", `安装 dingtalk-workspace-cli 失败: ${e.message}`);
      throw e;
    } finally {
      dwsInstalling.value = false;
    }
  }

  // Check all statuses
  async function initStatus() {
    const hasLark = await checkLarkInstall();
    if (hasLark) await checkLarkStatus();

    const hasDws = await checkDwsInstall();
    if (hasDws) await checkDwsStatus();
  }

  return {
    larkInstalled,
    dwsInstalled,
    larkConnected,
    dwsConnected,
    larkUsername,
    dwsUsername,
    syncLogs,
    addLog,
    runCli,
    checkLarkInstall,
    checkDwsInstall,
    checkLarkStatus,
    checkDwsStatus,
    getLarkLoginUrl,
    getDwsLoginUrl,
    logoutLark,
    logoutDws,
    larkInstalling,
    dwsInstalling,
    installLarkCli,
    installDwsCli,
    initStatus,
  };
});
