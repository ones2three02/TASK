import { uuid } from "@/lib/utils";
import type { Target, Action, Serve, Keep } from "@/stores/taskStore";
import { isTauriRuntime } from "@/lib/tauriRuntime";

// Dynamically imports Tauri fs plugin to ensure browser compatibility
async function getFs() {
  if (!isTauriRuntime()) {
    return null;
  }
  try {
    return await import("@tauri-apps/plugin-fs");
  } catch (e) {
    console.warn("[TASK] Failed to import tauri-plugin-fs", e);
    return null;
  }
}

/**
 * Checks if folder exists, creates if not.
 */
async function ensureDir(path: string) {
  const fs = await getFs();
  if (!fs) return;
  try {
    const isExist = await fs.exists(path);
    if (!isExist) {
      await fs.mkdir(path, { recursive: true });
    }
  } catch (e) {
    console.error(`[TASK] ensureDir failed for ${path}`, e);
  }
}

/**
 * Initializes the T-A-S-K physical folders in a local path.
 */
export async function initializeProjectFolders(projectPath: string) {
  const fs = await getFs();
  if (!fs) return;

  try {
    await ensureDir(`${projectPath}/1_TARGET`);
    await ensureDir(`${projectPath}/2_ACTION/backlog`);
    await ensureDir(`${projectPath}/3_SERVE/evidence`);
    await ensureDir(`${projectPath}/3_SERVE/reports`);
    await ensureDir(`${projectPath}/4_KEEP/assets`);
    await ensureDir(`${projectPath}/4_KEEP/knowledge`);

    // Create empty boilerplate files if they don't exist
    const charterPath = `${projectPath}/1_TARGET/charter.md`;
    if (!(await fs.exists(charterPath))) {
      await fs.writeTextFile(charterPath, "# 项目目标规划\n\n每个目标以二级标题 `## 🎯 目标：[标题]` 开始。\n");
    }

    const priorityStandardPath = `${projectPath}/1_TARGET/priority_standard.md`;
    if (!(await fs.exists(priorityStandardPath))) {
      const standardText =
        `# 任务优先级 (Priority) 定义标准与响应时限\n\n` +
        `为了让个人开发任务有章可循、杜绝延误，我们制定了以下全局优先级规范，并在看板中予以严格执行。\n\n` +
        `## 优先级等级标准 (P0 - P3)\n\n` +
        `### 🔴 P0 - 阻塞特急 (Blocker / Urgent)\n` +
        `- **定义**: 核心交付生命线的阻塞性问题，或严重阻碍后续流程进行的任务（如关键 Bug 阻碍测试、开发环境崩溃）。\n` +
        `- **执行原则**: **第一顺位处理**。原则上必须中断其他非 P0 任务立刻修复，需即刻解决或给出替代方案。\n` +
        `- **示例**: 生产数据库无法连接；编译打包持续失败；核心功能完全卡死。\n\n` +
        `### 🟠 P1 - 关键高优 (Critical / High)\n` +
        `- **定义**: 核心业务功能开发，直接影响主流程交付，或核心非阻塞性缺陷。\n` +
        `- **执行原则**: **本迭代/本目标交付的核心主力任务**。每日看板前置推进，确保在本里程碑达成前必须全部做完。\n` +
        `- **示例**: 支付订单接口联调；功能核心页面 UI 搭建与路由配置；用户鉴权拦截功能。\n\n` +
        `### 🔵 P2 - 重要中优 (Major / Medium)\n` +
        `- **定义**: 日常需求开发，核心流程的优化，不影响核心骨架，是版本的主要填充内容。\n` +
        `- **执行原则**: **常规按计划排期完成**。在 P0/P1 处理完毕后按顺序推进。\n` +
        `- **示例**: 补充用户资料修改页面；增加列表按日期排序规则；编写非核心接口的单元测试。\n\n` +
        `### ⚪ P3 - 低优建议 (Minor / Low)\n` +
        `- **定义**: 体验优化、富余功能、长远的技术债重构或无时限要求的想法。\n` +
        `- **执行原则**: **充当“润滑剂”任务**。当前面高优任务全部达成或处于等待状态时，可抽空零星处理。\n` +
        `- **示例**: 调整一个按钮的微弱圆角边框；将旧的 CSS 属性替换为最新规范；收集用户界面的概念性反馈。\n`;
      await fs.writeTextFile(priorityStandardPath, standardText);
    }

    const kanbanPath = `${projectPath}/2_ACTION/kanban.json`;
    if (!(await fs.exists(kanbanPath))) {
      await fs.writeTextFile(kanbanPath, "[]");
    }

    const checklistPath = `${projectPath}/3_SERVE/acceptance_checklist.md`;
    if (!(await fs.exists(checklistPath))) {
      await fs.writeTextFile(checklistPath, "# 交付物验收清单\n\n在此记录项目的验收状态。\n");
    }

    const retroPath = `${projectPath}/4_KEEP/retrospective.md`;
    if (!(await fs.exists(retroPath))) {
      await fs.writeTextFile(retroPath, "# 项目复盘总结\n\n在项目收尾时生成此复盘。\n");
    }
  } catch (e) {
    console.error("[TASK] Failed to initialize project folders", e);
  }
}

/**
 * Compiles target data into target charter markdown.
 */
export function compileTargetToCharter(targets: Target[]): string {
  let content = "# 项目目标规划\n\n每个目标以二级标题 `## 🎯 目标：[标题]` 开始。\n\n";
  for (const t of targets) {
    content += `## 🎯 目标：${t.title}\n`;
    if (t.description) {
      content += `${t.description.trim()}\n\n`;
    } else {
      content += "\n";
    }

    content += `### 成功标准\n`;
    if (t.successCriteria && t.successCriteria.length > 0) {
      for (const item of t.successCriteria) {
        content += `- [${item.completed ? "x" : " "}] ${item.title}\n`;
      }
    } else {
      content += `- [ ] 默认成功标准\n`;
    }
    content += `\n`;

    content += `### 范围红线\n`;
    content += `- **In Scope (要做)**:\n`;
    if (t.scope) {
      const scopeItems = t.scope.split("\n");
      for (const item of scopeItems) {
        if (item.trim()) {
          content += `  - ${item.trim().replace(/^-\s*/, "")}\n`;
        }
      }
    } else {
      content += `  - 暂无\n`;
    }
    content += `- **Out of Scope (不做)**:\n`;
    if (t.outOfScope) {
      const outItems = t.outOfScope.split("\n");
      for (const item of outItems) {
        if (item.trim()) {
          content += `  - ${item.trim().replace(/^-\s*/, "")}\n`;
        }
      }
    } else {
      content += `  - 暂无\n`;
    }
    content += `\n`;

    content += `### 里里程碑\n`;
    if (t.milestones && t.milestones.length > 0) {
      for (const item of t.milestones) {
        content += `- [${item.completed ? "x" : " "}] ${item.title}\n`;
      }
    } else {
      content += `- [ ] 默认里程碑\n`;
    }
    content += `\n`;

    content += `### 识别风险\n`;
    if (t.risks && t.risks.length > 0) {
      for (const item of t.risks) {
        content += `- [${item.completed ? "x" : " "}] ${item.title}\n`;
      }
    } else {
      content += `- [ ] 默认风险\n`;
    }
    content += `\n`;
  }
  return content;
}

/**
 * Parses target charter markdown back to Target structures.
 */
export function parseCharterToTarget(charterContent: string, projectId: string): Target[] {
  const lines = charterContent.split("\n");
  const targets: Target[] = [];
  let currentTarget: Target | null = null;
  let currentSection: "description" | "successCriteria" | "scope" | "outOfScope" | "milestones" | "risks" | null = null;

  let scopeBuffer: string[] = [];
  let outOfScopeBuffer: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## 🎯 目标：")) {
      if (currentTarget) {
        currentTarget.scope = scopeBuffer.join("\n").trim();
        currentTarget.outOfScope = outOfScopeBuffer.join("\n").trim();
        targets.push(currentTarget);
      }
      const title = trimmed.substring("## 🎯 目标：".length).trim();
      currentTarget = {
        id: uuid(),
        projectId,
        title,
        description: "",
        status: "pending",
        createdAt: new Date().toISOString(),
        milestones: [],
        successCriteria: [],
        risks: [],
        scope: "",
        outOfScope: "",
      };
      scopeBuffer = [];
      outOfScopeBuffer = [];
      currentSection = "description";
      continue;
    }

    if (!currentTarget) continue;

    if (trimmed.startsWith("### ")) {
      const sectionName = trimmed.substring(4).trim();
      if (sectionName.includes("成功标准")) {
        currentSection = "successCriteria";
      } else if (sectionName.includes("范围红线")) {
        currentSection = "scope";
      } else if (sectionName.includes("里程碑")) {
        currentSection = "milestones";
      } else if (sectionName.includes("风险")) {
        currentSection = "risks";
      } else {
        currentSection = null;
      }
      continue;
    }

    if (currentSection === "description") {
      if (line.trim().length > 0 && !line.startsWith("#")) {
        currentTarget.description += (currentTarget.description ? "\n" : "") + line;
      }
    } else if (currentSection === "successCriteria") {
      const match = trimmed.match(/^-\s*\[([ xX])\]\s*(.*)$/);
      if (match) {
        currentTarget.successCriteria!.push({
          id: uuid(),
          title: match[2].trim(),
          completed: match[1].toLowerCase() === "x",
        });
      }
    } else if (currentSection === "milestones") {
      const match = trimmed.match(/^-\s*\[([ xX])\]\s*(.*)$/);
      if (match) {
        currentTarget.milestones.push({
          id: uuid(),
          title: match[2].trim(),
          completed: match[1].toLowerCase() === "x",
        });
      }
    } else if (currentSection === "risks") {
      const match = trimmed.match(/^-\s*\[([ xX])\]\s*(.*)$/);
      if (match) {
        currentTarget.risks!.push({
          id: uuid(),
          title: match[2].trim(),
          completed: match[1].toLowerCase() === "x",
        });
      }
    } else if (currentSection === "scope" || currentSection === "outOfScope") {
      if (trimmed.startsWith("- **In Scope")) {
        currentSection = "scope";
      } else if (trimmed.startsWith("- **Out of Scope")) {
        currentSection = "outOfScope";
      } else {
        const listMatch = trimmed.match(/^-\s*(.*)$/);
        if (listMatch) {
          const content = listMatch[1].trim();
          if (currentSection === "scope") {
            scopeBuffer.push(content);
          } else {
            outOfScopeBuffer.push(content);
          }
        }
      }
    }
  }

  if (currentTarget) {
    currentTarget.scope = scopeBuffer.join("\n").trim();
    currentTarget.outOfScope = outOfScopeBuffer.join("\n").trim();
    targets.push(currentTarget);
  }

  return targets;
}

/**
 * Saves targets to charter.md.
 */
export async function syncTargetsToLocal(projectPath: string, targets: Target[]) {
  const fs = await getFs();
  if (!fs) return;
  const content = compileTargetToCharter(targets);
  await ensureDir(`${projectPath}/1_TARGET`);
  await fs.writeTextFile(`${projectPath}/1_TARGET/charter.md`, content);
}

/**
 * Saves actions to kanban.json.
 */
export async function syncActionsToLocal(projectPath: string, actions: Action[]) {
  const fs = await getFs();
  if (!fs) return;
  await ensureDir(`${projectPath}/2_ACTION`);
  const content = JSON.stringify(actions, null, 2);
  await fs.writeTextFile(`${projectPath}/2_ACTION/kanban.json`, content);
}

/**
 * Compiles serve data into acceptance checklists markdown.
 */
export function compileServeToChecklist(serves: Serve[]): string {
  let content = "# 交付物验收清单\n\n在此记录项目的验收状态。\n\n";
  for (const s of serves) {
    content += `## 📦 交付：${s.title}\n`;
    content += `- 服务对象: ${s.client}\n`;
    content += `- 核心交付物: ${s.deliverable}\n`;
    content += `- 验收状态: ${s.acceptanceStatus}\n`;
    if (s.description) {
      content += `\n${s.description.trim()}\n`;
    }
    content += `\n### 验收 Checklist\n`;
    if (s.acceptanceChecklist && s.acceptanceChecklist.length > 0) {
      for (const item of s.acceptanceChecklist) {
        content += `- [${item.completed ? "x" : " "}] ${item.title}\n`;
      }
    } else {
      content += `- [ ] 默认验收项\n`;
    }
    content += `\n`;

    if (s.reworkItems && s.reworkItems.length > 0) {
      content += `### 返工/整改记录\n`;
      for (const item of s.reworkItems) {
        content += `- [${item.completed ? "x" : " "}] ${item.title}\n`;
      }
      content += `\n`;
    }
  }
  return content;
}

/**
 * Saves serves to acceptance_checklist.md.
 */
export async function syncServesToLocal(projectPath: string, serves: Serve[]) {
  const fs = await getFs();
  if (!fs) return;
  const content = compileServeToChecklist(serves);
  await ensureDir(`${projectPath}/3_SERVE`);
  await fs.writeTextFile(`${projectPath}/3_SERVE/acceptance_checklist.md`, content);
}

/**
 * Copy serve evidence file to local project folder.
 */
export async function copyFileToLocalServe(projectPath: string, filePath: string, actionTitle: string): Promise<string> {
  const fs = await getFs();
  if (!fs) return "";
  try {
    const filename = filePath.split(/[/\\]/).pop() || "evidence";
    const destFolder = `${projectPath}/3_SERVE/evidence/${actionTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")}`;
    await ensureDir(destFolder);
    const destPath = `${destFolder}/${filename}`;
    if (typeof fs.copyFile === "function") {
      await fs.copyFile(filePath, destPath);
      return destPath;
    }
  } catch (e) {
    console.error("[TASK] Copy file to local serve failed", e);
  }
  return "";
}

/**
 * Copy keep document to local KEEP folder.
 */
export async function copyFileToLocalKeep(projectPath: string, filePath: string): Promise<string> {
  const fs = await getFs();
  if (!fs) return "";
  try {
    const filename = filePath.split(/[/\\]/).pop() || "document";
    const destFolder = `${projectPath}/4_KEEP/docs`;
    await ensureDir(destFolder);
    const destPath = `${destFolder}/${filename}`;
    if (typeof fs.copyFile === "function") {
      await fs.copyFile(filePath, destPath);
      return destPath;
    }
  } catch (e) {
    console.error("[TASK] Copy file to local keep failed", e);
  }
  return "";
}

/**
 * Writes retrospective.md in KEEP folder.
 */
export async function saveRetrospectiveToLocal(projectPath: string, content: string) {
  const fs = await getFs();
  if (!fs) return;
  await ensureDir(`${projectPath}/4_KEEP`);
  await fs.writeTextFile(`${projectPath}/4_KEEP/retrospective.md`, content);
}

/**
 * Saves keeps (specifically documents/retrospectives) as markdown files in the local 4_KEEP directory.
 */
export async function syncKeepsToLocal(projectPath: string, keeps: Keep[]) {
  const fs = await getFs();
  if (!fs) return;

  await ensureDir(`${projectPath}/4_KEEP/knowledge`);

  for (const k of keeps) {
    if (k.type === "document" || k.type === "retrospective") {
      const filename = `${k.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")}.md`;
      const filePath = `${projectPath}/4_KEEP/knowledge/${filename}`;
      try {
        await fs.writeTextFile(filePath, `# ${k.name}\n\n${k.content}`);
      } catch (e) {
        console.error(`[TASK] failed to write keep ${filename}`, e);
      }
    }
  }
}

/**
 * Write predefined deliverable templates directly into reports directory.
 */
export async function writeServeTemplateToLocal(projectPath: string, templateType: "architecture_design" | "technical_implementation" | "test_cases" | "deployment_guide" | "user_guide", serveTitle: string): Promise<string> {
  const fs = await getFs();
  if (!fs) return "";

  const cleanTitle = serveTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");
  const reportsDir = `${projectPath}/3_SERVE/reports`;
  await ensureDir(reportsDir);

  let filename = "";
  let title = "";
  let content = "";

  if (templateType === "architecture_design") {
    filename = `1_概要设计_${cleanTitle}.md`;
    title = `📐 概要设计文档 - ${serveTitle}`;
    content =
      `# ${title}\n\n` +
      `## 1. 业务需求与背景说明\n- **建设背景**: 简述系统或功能模块的建设背景及要解决的业务痛点。\n- **核心目标**: 说明本项交付期望达到的核心业务/技术目标。\n\n` +
      `## 2. 需求边界红线\n- **In Scope (要做)**: 明确本次需要覆盖的核心业务场景及交付物。\n- **Out of Scope (不做)**: 明确不在本次范围内的事项，防止交付蔓延。\n\n` +
      `## 3. 总体架构与拓扑设计\n- **系统架构图**: 描述该模块与外部系统/宿主应用的调用关系及拓扑边界（推荐使用 Mermaid 架构图）。\n- **分层职责划分**: 描述各模块/类库的作用及其依赖关系（如 Controller, Service, Repository 等）。\n- **技术选型及理由**: 说明采用的关键技术（库、框架、协议）及考量因素。\n\n` +
      `## 4. 数据实体与存储设计\n- **核心数据模型 (ERD)**: 实体关系图或核心类关系设计（推荐使用 Mermaid ER 关系图）。\n- **关键表结构设计**: 主要数据表或核心持久化结构的字段定义、索引规划与关联规则。\n- **存储介质划分**: 缓存与数据库存储的分工与数据一致性机制。\n`;
  } else if (templateType === "technical_implementation") {
    filename = `2_实现方案_${cleanTitle}.md`;
    title = `💻 技术实现方案 - ${serveTitle}`;
    content =
      `# ${title}\n\n` +
      `## 1. 业务控制流与模块划分\n- **核心时序控制**: 描述关键业务路径下的调用链路及控制流（推荐使用 Mermaid 序列图）。\n- **关键类与接口定义**: 核心服务类、方法签名、逻辑分层结构设计。\n\n` +
      `## 2. 事务与并发安全设计\n- **事务边界控制**: 明确多表写入、数据更新时的事务管理策略（如 @Transactional 配置与异常回滚机制）。\n- **并发与幂等设计**: 并发读写、接口防重防刷的应对策略（唯一约束、分布式锁、乐观锁等）。\n\n` +
      `## 3. API 契约与对外接口设计\n- **协议与路径**: 请求的调用方式及核心端点（HTTP RESTful / WebSockets / IPC / RPC）。\n- **接口规格定义**: 详细入参校验、返回结构（如统一包装器 Result<T>）及自定义错误码规范。\n\n` +
      `## 4. 关键代码段与技术亮点\n- **设计模式应用**: 核心算法或复杂业务解耦采用的设计模式说明。\n- **公共提炼与复用**: 封装 of 通用工具方法、钩子、拦截器说明。\n`;
  } else if (templateType === "test_cases") {
    filename = `3_测试用例_${cleanTitle}.md`;
    title = `🧪 测试用例与验证报告 - ${serveTitle}`;
    content =
      `# ${title}\n\n` +
      `## 1. 测试策略与环境配置\n- **测试策略**: 本次交付的功能覆盖点、边界校验及压力测试方案说明。\n- **环境搭建与配置**: 依赖的系统、库版本，配置文件项，测试数据初始化规范，Mock 依赖配置。\n\n` +
      `## 2. 功能自测用例明细\n- **正常链路验证**: 包含核心的成功操作、入参出参比对流程。\n- **异常与边界验证**: 包含参数非法、数据库异常、网络断开等分支场景的系统健壮性测试。\n- **性能与压力自测**: 关键接口的单机吞吐、响应延迟自测记录。\n\n` +
      `## 3. 看板 Action 关联自测明细 (自动汇总)\n*(点击交付面板的“一键汇总报告”后将自动在此处追加 Actions 的自测状态明细)*\n`;
  } else if (templateType === "deployment_guide") {
    filename = `4_上线部署_${cleanTitle}.md`;
    title = `🚀 上线部署与配置指引 - ${serveTitle}`;
    content =
      `# ${title}\n\n` +
      `## 1. 上线前置条件与依赖版本\n- **运行环境限制**: 所需的 Node/Java 等运行时版本、操作系统核心限制。\n- **外部服务依赖**: 数据库版本依赖、三方接口开通情况、域名及端口申请。\n\n` +
      `## 2. 环境变量与配置参数规范\n| 配置项 | 是否必填 | 默认值 | 示例值 | 描述与影响范围 |\n| :--- | :--- | :--- | :--- | :--- |\n| PORT | 是 | 8080 | 8080 | 服务监听端口 |\n| DATABASE_URL | 是 | - | jdbc:mysql://localhost:3306/db | 生产数据库连接字 |\n\n` +
      `## 3. 步骤化部署与运行指令\n- **编译打包构建**: 依赖下载、编译打包完整命令（如 mvn clean package 或 pnpm build）。\n- **安装启动指令**: 运行、拉起并设置为守护进程/服务容器的命令。\n- **可用性自检机制**: 探针健康检查路径（如 /ping 或 /actuator/health）以及如何抓取关键日志自检。\n\n` +
      `## 4. 回撤方案与应急预案\n- **应用回退机制**: 启动异常时，应用版本回滚与清理的完整操作步骤。\n- **数据回流/恢复**: 数据库表结构变更 (DDL) 及历史数据订正的回撤与清洗方案。\n`;
  } else {
    filename = `5_功能操作_${cleanTitle}.md`;
    title = `📖 功能操作说明与用户指南 - ${serveTitle}`;
    content =
      `# ${title}\n\n` +
      `## 1. 系统功能与界面板块设计\n- **核心功能导航说明**: 简述系统主要功能菜单与子界面入口。\n- **典型用户界面展示**: 介绍核心功能所处的导航页面及按钮位置说明。\n\n` +
      `## 2. 核心业务流程操作指引\n- **常用业务功能配置**: 介绍前置系统参数和业务基础数据的配置项。\n- **标准业务流操作步骤**: 描述标准的录入、流转、保存和触发的具体行为与预期。\n\n` +
      `## 3. 异常排错说明与 FAQ\n- **常见报错与自我修复**: 列出日常操作易犯的校验提示及其快速规避解决方案。\n- **常用技巧与 FAQ**: 提供用户日常使用中的小贴士与问题解答列表。\n`;
  }

  const filePath = `${reportsDir}/${filename}`;
  try {
    await fs.writeTextFile(filePath, content);
    return filePath;
  } catch (e) {
    console.error(`[TASK] failed to write serve template ${filename}`, e);
    return "";
  }
}

/**
 * Parses markdown for relative image paths, copies them to destImagesDirPath,
 * and rewrites the markdown image links to point to destImagesDirPath.
 */
export async function processMarkdownImages(markdownContent: string, sourceMdFilePath: string, destImagesDirPath: string): Promise<string> {
  const fs = await getFs();
  if (!fs) return markdownContent;

  const imageRegex = /!\[(.*?)\]\(((?!\w+:\/\/|\/).*?)\)/g;
  let newContent = markdownContent;
  const matches = [...markdownContent.matchAll(imageRegex)];

  if (matches.length === 0) return markdownContent;

  const srcDir = sourceMdFilePath.replace(/[/\\][^/\\]+$/, "");

  // Resolve path helper that handles relative segments like . and ..
  function resolvePath(baseDir: string, relativePath: string): string {
    const isWindows = baseDir.includes("\\") || relativePath.includes("\\");
    const separator = isWindows ? "\\" : "/";
    const baseParts = baseDir.split(/[/\\]/).filter(Boolean);
    const relParts = relativePath.split(/[/\\]/).filter(Boolean);
    const startsWithSlash = baseDir.startsWith("/");

    const resultParts = [...baseParts];
    for (const part of relParts) {
      if (part === ".") continue;
      if (part === "..") {
        resultParts.pop();
      } else {
        resultParts.push(part);
      }
    }
    const joined = resultParts.join(separator);
    return startsWithSlash ? "/" + joined : joined;
  }

  await ensureDir(destImagesDirPath);

  for (const match of matches) {
    const fullMatch = match[0];
    const altText = match[1];
    const relativeImagePath = match[2];

    try {
      const decodedRelPath = decodeURIComponent(relativeImagePath);
      const absSrcPath = resolvePath(srcDir, decodedRelPath);

      if (await fs.exists(absSrcPath)) {
        const fileName = decodedRelPath.split(/[/\\]/).pop() || "image.png";
        const absDestPath = `${destImagesDirPath}/${fileName}`;

        await fs.copyFile(absSrcPath, absDestPath);

        // Rewrite image reference in markdown
        const newImgLink = `![${altText}](./images/${fileName})`;
        newContent = newContent.replace(fullMatch, newImgLink);
      }
    } catch (e) {
      console.error("[TASK] Failed to copy local image relative to imported file: " + relativeImagePath, e);
    }
  }

  return newContent;
}

/**
 * 保存项目插图到本地物理路径 4_KEEP/assets/illustration.jpg
 */
export async function saveIllustrationToLocal(projectPath: string, base64Data: string) {
  if (!base64Data || !base64Data.startsWith("data:")) return;
  const fs = await getFs();
  if (!fs) return;

  try {
    const assetsDir = `${projectPath}/4_KEEP/assets`;
    await ensureDir(assetsDir);

    const base64Content = base64Data.split(",")[1];
    if (!base64Content) return;

    const binaryString = atob(base64Content);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const filePath = `${assetsDir}/illustration.jpg`;
    await fs.writeFile(filePath, bytes);
    console.log(`[TASK] Successfully saved illustration to local: ${filePath}`);
  } catch (e) {
    console.error("[TASK] Failed to save illustration to local folder", e);
  }
}

/**
 * 从本地物理路径删除插画文件
 */
export async function removeIllustrationFromLocal(projectPath: string) {
  const fs = await getFs();
  if (!fs) return;
  try {
    const filePath = `${projectPath}/4_KEEP/assets/illustration.jpg`;
    if (await fs.exists(filePath)) {
      await fs.remove(filePath);
    }
  } catch (e) {
    console.error("[TASK] Failed to remove local illustration file", e);
  }
}
