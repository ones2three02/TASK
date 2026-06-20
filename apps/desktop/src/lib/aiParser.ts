import type { AiConfig } from "@/stores/settingsStore";
import { aiComplete } from "@/lib/api";

export interface ParsedRequirementResult {
  targets: {
    title: string;
    description: string;
    milestones: string[];
    scope: string;
    outOfScope: string;
    successCriteria: string[];
    risks: string[];
  }[];
  actions: {
    title: string;
    description: string;
    priority: "P0" | "P1" | "P2" | "P3";
    serveTitle: string;
    dueDate: string;
    devItems?: string[];
    testItems?: string[];
    outputItems?: string[];
  }[];
  serves: {
    title: string;
    description: string;
    deliverable: string;
    client: string;
    plannedAt: string;
    acceptanceChecklist: string[];
  }[];
  keeps: {
    name: string;
    type: "document" | "link" | "archive" | "evidence" | "version" | "retrospective";
    content: string;
    relatedServeTitle: string;
  }[];
}

export interface RequirementReferenceDocument {
  name: string;
  content: string;
}

const SYSTEM_PROMPT = `你是一个专业的软件工程架构师和敏捷项目管理专家。
你的任务是将用户的“项目需求文档”或“想法描述”，分解为适合项目启动的完整 TASK 四层规划：目标章程 (T - Targets)、执行行动 (A - Actions)、交付计划 (S - Serves)、沉淀资产 (K - Keeps)。

请严格遵循以下规则输出：
1. 必须输出且仅输出一个合法的 JSON 对象，不要有任何 Markdown 包裹 (不要使用 \`\`\`json 标记)，不要有任何前言、后记或解释。
2. 目标 (Targets) 是项目章程，每个目标必须包含 title、description、scope、outOfScope、successCriteria、risks 和 2-3 个 milestones。
3. 行动 (Actions) 是执行控制卡片，每个行动必须包含 title、description、priority，同时必须细化其内部微生命周期，包含开发步骤 (devItems)、测试用例 (testItems)、预期产出 (outputItems)。可用 serveTitle 关联某个 Serve 的 title。
4. 交付 (Serves) 是交付计划与验收中心，每个交付必须包含 title、description、deliverable、client、plannedAt、acceptanceChecklist。
5. 沉淀 (Keeps) 是建议归档资产，每项必须包含 name、type、content，可用 relatedServeTitle 关联某个 Serve 的 title；type 必须是 "document"、"link"、"archive"、"evidence"、"version"、"retrospective" 之一。
6. JSON 的格式必须严格为：
{
  "targets": [
    {
      "title": "目标名称",
      "description": "目标描述",
      "scope": "范围说明",
      "outOfScope": "非范围说明",
      "successCriteria": ["成功标准A", "成功标准B"],
      "risks": ["风险假设A"],
      "milestones": ["里程碑A", "里程碑B"]
    }
  ],
  "actions": [
    {
      "title": "行动名称",
      "description": "行动细节描述",
      "priority": "P0" | "P1" | "P2" | "P3",
      "serveTitle": "关联的交付计划名称",
      "dueDate": "YYYY-MM-DD 或空字符串",
      "devItems": ["开发任务步骤A", "开发任务步骤B"],
      "testItems": ["自测/单测用例A", "异常边界测试B"],
      "outputItems": ["产出物A (例如某文档或配置文件)", "产出物B"]
    }
  ],
  "serves": [
    {
      "title": "交付计划名称",
      "description": "交付说明",
      "deliverable": "交付物",
      "client": "服务对象/需求方",
      "plannedAt": "YYYY-MM-DD 或空字符串",
      "acceptanceChecklist": ["验收项A", "验收项B"]
    }
  ],
  "keeps": [
    {
      "name": "资产名称",
      "type": "document",
      "content": "资产内容或链接",
      "relatedServeTitle": "关联的交付计划名称"
    }
  ]
}

硬性要求：
- JSON 属性名和字符串值必须使用英文双引号。
- 字符串内部不能出现未转义的换行、制表符或控制字符。
- 不要输出注释、Markdown、自然语言解释或多余字段。`;

const JSON_REPAIR_PROMPT = `你是 JSON 修复器。用户会提供一个模型返回的错误 JSON 文本。
请只返回修复后的严格 JSON 对象，不要输出 Markdown、解释或额外文字。
修复后的结构必须包含 targets、actions、serves、keeps 四个数组，并符合 TASK 四层规划结构。`;

const COMPACT_RETRY_PROMPT = `${SYSTEM_PROMPT}

这是一次容错重试：上一次返回疑似被截断。
请输出“精简但完整”的 TASK 四层规划：
- targets 最多 1 个；
- actions 最多 4 个；
- serves 最多 3 个；
- keeps 最多 4 个；
- 每个字符串字段尽量控制在 80 个中文字符以内；
- acceptanceChecklist、successCriteria、risks、milestones 每项最多 3 条。
必须优先保证 JSON 完整闭合，不要为了内容丰富导致输出被截断。`;

const MAX_PREVIEW_LENGTH = 500;
const REQUIREMENT_PARSE_MAX_TOKENS = 8192;
const COMPACT_REQUIREMENT_PARSE_MAX_TOKENS = 4096;
const REFERENCE_PROMPT_CHAR_BUDGET = 12_000;
const REFERENCE_PROMPT_PER_DOCUMENT_LIMIT = 6_000;
const COMPACT_REFERENCE_PROMPT_CHAR_BUDGET = 4_000;
const COMPACT_REFERENCE_PROMPT_PER_DOCUMENT_LIMIT = 2_000;
const SERVE_KEEP_SUGGESTION_MAX_TOKENS = 4096;
const VALID_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const VALID_KEEP_TYPES = new Set(["document", "link", "archive", "evidence", "version", "retrospective"]);

export async function parseRequirementWithAi(config: AiConfig, requirementText: string, referenceDocuments: RequirementReferenceDocument[] = []): Promise<ParsedRequirementResult> {
  let textContent: string;
  try {
    textContent = await requestRequirementCompletion(config, SYSTEM_PROMPT, buildRequirementPrompt(requirementText, referenceDocuments));
  } catch (error) {
    if (!isAiTransportError(error)) {
      throw error;
    }

    try {
      const compactTextContent = await requestRequirementCompletion(config, COMPACT_RETRY_PROMPT, buildCompactRetryRequirementPrompt(requirementText, referenceDocuments), COMPACT_REQUIREMENT_PARSE_MAX_TOKENS);
      return cleanAndParseRequirementJson(compactTextContent);
    } catch (compactError) {
      throw formatAiTransportError(compactError, config, referenceDocuments.length > 0);
    }
  }

  try {
    return cleanAndParseRequirementJson(textContent);
  } catch (error) {
    if (isLikelyTruncatedParseError(error)) {
      try {
        const compactTextContent = await requestRequirementCompletion(config, COMPACT_RETRY_PROMPT, buildCompactRetryRequirementPrompt(requirementText, referenceDocuments));
        return cleanAndParseRequirementJson(compactTextContent);
      } catch (compactError) {
        return repairRequirementJsonOrThrow(config, compactError, compactError instanceof AiRequirementParseError && compactError.rawText ? compactError.rawText : textContent);
      }
    }

    return repairRequirementJsonOrThrow(config, error, textContent);
  }
}

async function requestRequirementCompletion(config: AiConfig, systemPrompt: string, userPrompt: string, maxTokens = REQUIREMENT_PARSE_MAX_TOKENS): Promise<string> {
  return aiComplete({
    config,
    systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens,
    temperature: 0.1,
  });
}

async function repairRequirementJsonOrThrow(config: AiConfig, originalError: unknown, rawText: string): Promise<ParsedRequirementResult> {
  try {
    const repairedContent = await aiComplete({
      config,
      systemPrompt: JSON_REPAIR_PROMPT,
      messages: [
        {
          role: "user" as const,
          content: `请修复以下 JSON，并保持 TASK 四层规划结构：\n\n${rawText}`,
        },
      ],
      maxTokens: REQUIREMENT_PARSE_MAX_TOKENS,
      temperature: 0,
    });

    try {
      return cleanAndParseRequirementJson(repairedContent);
    } catch {
      throw originalError;
    }
  } catch {
    throw originalError;
  }
}

export function buildRequirementPrompt(requirementText: string, referenceDocuments: RequirementReferenceDocument[] = []): string {
  const references = formatReferenceDocumentsForPrompt(referenceDocuments, REFERENCE_PROMPT_CHAR_BUDGET, REFERENCE_PROMPT_PER_DOCUMENT_LIMIT);

  if (!references) {
    return `这是需求文档内容，请开始进行 TASK 四层规划，覆盖目标、行动、交付和沉淀:\n${requirementText}`;
  }

  return `请先理解以下参考资料，再结合用户需求进行 TASK 四层规划，覆盖目标、行动、交付和沉淀。

${references}

【用户需求】
${requirementText}`;
}

function buildCompactRetryRequirementPrompt(requirementText: string, referenceDocuments: RequirementReferenceDocument[]): string {
  const references = formatReferenceDocumentsForPrompt(referenceDocuments, COMPACT_REFERENCE_PROMPT_CHAR_BUDGET, COMPACT_REFERENCE_PROMPT_PER_DOCUMENT_LIMIT);

  const compactRequirementText = requirementText.trim().slice(0, 8_000);
  const requirementTruncatedHint = requirementText.trim().length > compactRequirementText.length ? "\n（用户需求较长，此处只提供前 8000 字符用于重试。）" : "";

  if (!references) {
    return `上一次 TASK JSON 输出疑似被截断。请基于以下需求输出精简但完整闭合的 JSON：\n${compactRequirementText}${requirementTruncatedHint}`;
  }

  return `上一次 TASK JSON 输出疑似被截断。请基于以下参考资料和用户需求输出精简但完整闭合的 JSON。

${references}

【用户需求】
${compactRequirementText}${requirementTruncatedHint}`;
}

function formatReferenceDocumentsForPrompt(referenceDocuments: RequirementReferenceDocument[], totalBudget: number, perDocumentLimit: number): string {
  let remaining = totalBudget;
  const formatted: string[] = [];

  for (const [index, document] of referenceDocuments.entries()) {
    if (remaining <= 0) break;

    const normalizedContent = document.content.replace(/\r\n/g, "\n").trim();
    if (!normalizedContent) continue;

    const limit = Math.min(remaining, perDocumentLimit);
    const content = normalizedContent.slice(0, limit);
    remaining -= content.length;

    const truncatedHint = normalizedContent.length > content.length ? `\n（该参考文档较长，已只发送前 ${content.length.toLocaleString()} 字符。）` : "";
    formatted.push(`【参考文档 ${index + 1}：${document.name}】\n${content}${truncatedHint}`);
  }

  return formatted.join("\n\n");
}

function isAiTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /request failed|error sending request|timed out|timeout|dns|connect|connection|tls|ssl|network|dispatch failure/i.test(message);
}

function formatAiTransportError(error: unknown, config: AiConfig, hasReferenceDocuments: boolean): Error {
  const message = error instanceof Error ? error.message : String(error);
  const endpoint = config.endpoint || "未配置";
  const endpointHost = `${safeEndpointHost(endpoint)} ${message.toLowerCase()}`;
  const minimaxHint = endpointHost.includes("minimax") || endpointHost.includes("minimaxi") ? "当前 MiniMax 接口在网络/TLS 握手阶段不可达。请在「系统设置 → AI 设置」中确认 endpoint 是否正确，必要时启用代理后重试。" : "当前 AI 接口网络不可达。请检查网络、代理、endpoint 和模型服务状态后重试。";
  const referenceHint = hasReferenceDocuments ? "已自动使用精简参考资料重试一次，但仍然连接失败。你也可以先删除参考文档，只用需求文本验证模型配置。" : "请先在 AI 设置里测试连接，确认模型配置可用。";

  return new Error(`${minimaxHint}${referenceHint} 原始错误：${message}`);
}

function safeEndpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host.toLowerCase();
  } catch {
    return endpoint.toLowerCase();
  }
}

export function cleanAndParseRequirementJson(rawText: string): ParsedRequirementResult {
  const cleaned = extractJsonCandidate(rawText);

  if (!cleaned) {
    throw new AiRequirementParseError("解析 AI 响应失败：AI 服务返回空内容。请检查当前模型是否支持聊天补全，或换用更稳定的模型后重试。", {
      rawText,
      cleanedText: cleaned,
      reason: "empty response",
      maybeTruncated: true,
    });
  }

  try {
    return normalizeParsedRequirement(JSON.parse(cleaned));
  } catch (error) {
    console.error("AI response failed to parse as JSON. Raw text:", rawText);
    const preview = cleaned.slice(0, MAX_PREVIEW_LENGTH);
    const reason = error instanceof Error ? error.message : String(error);
    const maybeTruncated = !cleaned.trimEnd().endsWith("}") || /unexpected eof|unterminated|string literal|end of json input/i.test(reason);
    const truncatedHint = maybeTruncated ? "响应疑似被模型截断；已提高输出长度，请减少参考文档长度或换用更大输出上限的模型后重试。" : "请重试，或换用更稳定的 JSON 输出模型。";
    throw new AiRequirementParseError(`解析 AI 响应失败：返回数据不是合法的 JSON。错误原因: ${reason}。${truncatedHint} 响应片段: ${preview}`, {
      rawText,
      cleanedText: cleaned,
      reason,
      maybeTruncated,
    });
  }
}

export class AiRequirementParseError extends Error {
  readonly rawText: string;
  readonly cleanedText: string;
  readonly reason: string;
  readonly maybeTruncated: boolean;

  constructor(message: string, options: { rawText: string; cleanedText: string; reason: string; maybeTruncated: boolean }) {
    super(message);
    this.name = "AiRequirementParseError";
    this.rawText = options.rawText;
    this.cleanedText = options.cleanedText;
    this.reason = options.reason;
    this.maybeTruncated = options.maybeTruncated;
  }
}

function isLikelyTruncatedParseError(error: unknown): boolean {
  return error instanceof AiRequirementParseError && error.maybeTruncated;
}

function extractJsonCandidate(rawText: string): string {
  let cleaned = rawText.trim();
  // Remove think/thinking tags and their contents
  cleaned = cleaned.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, "").trim();

  const fencedJson = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedJson?.[1]) {
    cleaned = fencedJson[1].trim();
  }

  if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
    return cleaned;
  }

  const extracted = extractFirstBalancedJsonObject(cleaned);
  return extracted ?? cleaned;
}

function extractFirstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function normalizeParsedRequirement(value: unknown): ParsedRequirementResult {
  if (!isRecord(value) || !Array.isArray(value.targets) || !Array.isArray(value.actions)) {
    throw new Error("JSON 结构不符合要求，必须包含 targets 和 actions 数组。");
  }

  return {
    targets: value.targets.map((target, index) => normalizeTarget(target, index)),
    actions: value.actions.map((action, index) => normalizeAction(action, index)),
    serves: Array.isArray(value.serves) ? value.serves.map((serve, index) => normalizeServe(serve, index)) : [],
    keeps: Array.isArray(value.keeps) ? value.keeps.map((keep, index) => normalizeKeep(keep, index)) : [],
  };
}

function normalizeTarget(target: unknown, index: number): ParsedRequirementResult["targets"][number] {
  if (!isRecord(target)) {
    throw new Error(`第 ${index + 1} 个 target 不是对象。`);
  }

  return {
    title: readRequiredString(target, "title", `第 ${index + 1} 个 target`),
    description: readRequiredString(target, "description", `第 ${index + 1} 个 target`),
    scope: readOptionalString(target, "scope"),
    outOfScope: readOptionalString(target, "outOfScope"),
    successCriteria: readStringArray(target.successCriteria),
    risks: readStringArray(target.risks),
    milestones: Array.isArray(target.milestones) ? target.milestones.map((milestone) => String(milestone)).filter(Boolean) : [],
  };
}

function normalizeAction(action: unknown, index: number): ParsedRequirementResult["actions"][number] {
  if (!isRecord(action)) {
    throw new Error(`第 ${index + 1} 个 action 不是对象。`);
  }

  const priority = typeof action.priority === "string" && VALID_PRIORITIES.has(action.priority) ? action.priority : "P2";

  return {
    title: readRequiredString(action, "title", `第 ${index + 1} 个 action`),
    description: readRequiredString(action, "description", `第 ${index + 1} 个 action`),
    priority: priority as "P0" | "P1" | "P2" | "P3",
    serveTitle: readOptionalString(action, "serveTitle"),
    dueDate: readOptionalString(action, "dueDate"),
    devItems: readStringArray(action.devItems),
    testItems: readStringArray(action.testItems),
    outputItems: readStringArray(action.outputItems),
  };
}

function normalizeServe(serve: unknown, index: number): ParsedRequirementResult["serves"][number] {
  if (!isRecord(serve)) {
    throw new Error(`第 ${index + 1} 个 serve 不是对象。`);
  }

  return {
    title: readRequiredString(serve, "title", `第 ${index + 1} 个 serve`),
    description: readOptionalString(serve, "description"),
    deliverable: readOptionalString(serve, "deliverable"),
    client: readOptionalString(serve, "client"),
    plannedAt: readOptionalString(serve, "plannedAt"),
    acceptanceChecklist: readStringArray(serve.acceptanceChecklist),
  };
}

function normalizeKeep(keep: unknown, index: number): ParsedRequirementResult["keeps"][number] {
  if (!isRecord(keep)) {
    throw new Error(`第 ${index + 1} 个 keep 不是对象。`);
  }

  const type = typeof keep.type === "string" && VALID_KEEP_TYPES.has(keep.type) ? keep.type : "document";

  return {
    name: readRequiredString(keep, "name", `第 ${index + 1} 个 keep`),
    type: type as ParsedRequirementResult["keeps"][number]["type"],
    content: readOptionalString(keep, "content"),
    relatedServeTitle: readOptionalString(keep, "relatedServeTitle"),
  };
}

function readRequiredString(record: Record<string, unknown>, key: string, scope: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${scope} 缺少 ${key} 字符串。`);
  }
  return value.trim();
}

function readOptionalString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// AI auto-suggestion helper to generate Serve and Keep summaries
export async function suggestServeKeepWithAi(
  config: AiConfig,
  projectInfo: { name: string; description: string },
  completedActions: { title: string; description: string }[],
): Promise<{ serve: { title: string; client: string; deliverable: string; description: string }; keep: { name: string; type: "document" | "link"; content: string }[] }> {
  const autoPrompt = `你是一个专业的项目经理和知识管理者。
当前项目「${projectInfo.name}」（项目背景：${projectInfo.description}）已经顺利完成了所有子任务的开发与交付。
以下是已完成的行动任务列表：
${completedActions.map((a, i) => `${i + 1}. ${a.title} - ${a.description || ""}`).join("\n")}

根据已完成的任务列表，你的工作是为用户自动草拟：
1. S (Serve - 服务与交付价值)：明确该项目做完后服务了谁（需求方）、交付了什么核心软件或模块成果，以及带来的最终服务价值说明。
2. K (Keep - 资产留存）：建议用户沉淀归档 2 个最重要的资产条目（例如：文档备忘或代码库外链）。

请输出且仅输出一个合法的 JSON，不要使用 Markdown 包裹。JSON 结构必须严格为：
{
  "serve": {
    "title": "交付服务总结名称",
    "client": "服务对象/需求方",
    "deliverable": "核心交付物成果",
    "description": "此次交付的价值总结（20-50字，通顺专业）"
  },
  "keep": [
    {
      "name": "资产名称 (例如：代码库地址/用户使用指南)",
      "type": "document" 或 "link",
      "content": "归档的具体提示内容，如 link 类型建议提供链接占位符如 'github.com/your-org/repo'"
    }
  ]
}`;

  const textContent = await aiComplete({
    config,
    systemPrompt: "你是一个专业的敏捷收口专家，必须严格按要求返回 JSON 结构。",
    messages: [{ role: "user", content: autoPrompt }],
    maxTokens: SERVE_KEEP_SUGGESTION_MAX_TOKENS,
    temperature: 0.1,
  });

  return JSON.parse(extractJsonCandidate(textContent));
}

export interface ActionSplitResult {
  devItems: string[];
  testItems: string[];
  outputItems: string[];
}

export async function splitActionWithAi(config: AiConfig, actionTitle: string, actionDescription: string): Promise<ActionSplitResult> {
  const prompt = `你是一个专业的软件工程专家和敏捷研发教练。
我们当前有一个行动任务（Action），其信息如下：
任务标题：${actionTitle}
任务描述：${actionDescription || "无"}

为了帮助开发者高效、规范地执行此行动，请对该行动进行任务微生命周期拆解，细化为以下三个方面的具体检查项列表：
1. 开发步骤 (devItems)：实现该功能所需的分步编码或配置步骤（如：搭建数据库表、实现API控制器、编写业务逻辑等，生成 3-5 条）。
2. 测试用例 (testItems)：开发者自测、单测或联调阶段的要点（如：测试入参校验、测试边界条件、验证核心链路等，生成 2-3 条）。
3. 交付产出 (outputItems)：该行动开发完成后需归档或产出的具体成果（如：合并的代码、API接口文档、配置文件等，生成 1-2 条）。

请严格输出且仅输出一个合法的 JSON，不要使用 Markdown \`\`\`json 包裹，不要包含任何多余文字或前言后记。
格式必须为：
{
  "devItems": ["开发任务 A", "开发任务 B"],
  "testItems": ["自测项 A", "自测项 B"],
  "outputItems": ["产出物 A"]
}`;

  const textContent = await aiComplete({
    config,
    systemPrompt: "你是一个专业的敏捷拆包大师，只能输出无包裹的干净 JSON。",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2048,
    temperature: 0.1,
  });

  try {
    return JSON.parse(extractJsonCandidate(textContent));
  } catch (e) {
    console.error("Failed to parse splitActionWithAi JSON:", textContent, e);
    return { devItems: [], testItems: [], outputItems: [] };
  }
}

export async function generateKeepContentWithAi(config: AiConfig, action: "continue" | "summary" | "outline" | "polish", content: string, extraPrompt?: string): Promise<string> {
  let systemPrompt = "你是一个优秀的文案编辑和技术文档专家。";
  let prompt = "";

  if (action === "continue") {
    prompt = `请根据以下已有内容，继续通顺、自然地在后面续写一段合适的技术文档内容，保持语气和排版一致。请只输出续写的内容，不要重复原有的正文。
已有正文如下：
---
${content}
---
${extraPrompt ? `用户额外提示：${extraPrompt}` : ""}`;
  } else if (action === "summary") {
    prompt = `请对以下技术文档内容进行总结，精炼出一份 200 字以内的 Markdown 格式内容摘要：
---
${content}
---`;
  } else if (action === "outline") {
    prompt = `请根据以下提供的主题/描述信息，结合软件工程的最佳实践，生成一份详细的 Markdown 文档大纲（包含多级标题）：
主题说明：${content}
${extraPrompt ? `要求/偏好：${extraPrompt}` : ""}`;
  } else if (action === "polish") {
    prompt = `请对以下 Markdown 技术文档进行一键润色、纠错以及排版格式优化，使其逻辑更加清晰、用词更加专业、排版符合 Markdown 规范。请直接返回修改润色后的全部正文：
---
${content}
---
${extraPrompt ? `润色偏好：${extraPrompt}` : ""}`;
  }

  return await aiComplete({
    config,
    systemPrompt,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 4096,
    temperature: 0.3,
  });
}

export async function suggestAcceptanceCriteriaWithAi(config: AiConfig, title: string, description: string, deliverable: string, client: string): Promise<string[]> {
  const prompt = `你是一个专业的敏捷质量保障 (QA) 专家和交付负责人。
我们当前有一个正在进行交付的交付计划 (Serve)：
标题：${title}
描述：${description || "无"}
交付产出物：${deliverable}
需求方/服务客户：${client}

为了保证交付结果能够被客户顺利验收，请建议 3-5 条关键的验收条款（Acceptance Checklist Item），例如功能的完整性指标、质量性能要求、交付清单核对等。每条条款在一行里以中文简单清晰表述。

请输出且仅输出一个合法的 JSON 字符串数组，不要使用 Markdown 包裹。
格式必须为：
[
  "验收条件1: 验证核心功能...",
  "验收条件2: 交付物文档完整...",
  "验收条件3: 确保..."
]`;

  const textContent = await aiComplete({
    config,
    systemPrompt: "你是一个敏捷质量验收专家，只输出 JSON 数组，无需其他文字。",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2048,
    temperature: 0.2,
  });

  try {
    return JSON.parse(extractJsonCandidate(textContent));
  } catch (e) {
    console.error("Failed to parse suggestAcceptanceCriteriaWithAi JSON:", textContent, e);
    return [];
  }
}
