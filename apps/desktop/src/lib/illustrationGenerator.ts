import type { AiConfig } from "@/stores/settingsStore";
import { aiComplete } from "@/lib/api";

const ILLUSTRATION_SYSTEM_PROMPT = `你是一个有创意的视觉隐喻设计师。你的任务是根据用户提供的“项目名称”和“项目背景/描述”，为该项目构思一张专属的手绘风格解释性插画。
插画的视觉风格基于“小黑（Xiaohei）插画系统”，你必须严格遵守以下设计 DNA：

1. 核心角色（小黑 IP）：
   - 画面中必须有且只有一个核心角色叫“小黑”（英文：Xiaohei）。
   - 小黑的外观是：一个纯黑色实心的剪影小人，头上有两只小白点眼睛（dot eyes），四肢是纤细的黑线条。没有嘴巴、鼻子等任何其他五官，神情是空洞/无表情的。
   - 小黑必须亲自参与画面的核心动作（例如搬运东西、操作机器、看书等），绝对不能只是站在旁边当背景装饰。

2. 画面风格与美学：
   - 纯白色背景（Pure white background），绝不能有任何灰色调、纸张纹理或阴影。
   - 黑色手绘风格线条，带有轻微的抖动感（black hand-drawn line art with a slight jitter）。
   - 极其干净的画面，大量留白，主体的面积大约只占画面的 40% - 60%。

3. 批注与文字：
   - 画面中需要有少量的手写风格中文批注，批注颜色必须仅限红色（red）、橙色（orange）或蓝色（blue）三者之一，通常用来解释某个流程、状态或者表达某些冷幽默。
   - 避免生成大块的段落文字，只需要极短的标注词。

4. 物理隐喻创意：
   - 不要生成标准的商业插图、PPT 信息图或可爱的卡通贴纸。
   - 要构思一个“低技术（low-tech）、怪诞（grotesque）但物理上成立且符合逻辑”的物理隐喻。
   - 例如：如果要表达“数据同步”，隐喻可以是“小黑用网兜捕捉在空中的小飞虫（小虫标注为数据），把它们分门别类塞进小格子里”。
   - 例如：如果要表达“数据库清理”，隐喻可以是“小黑拿着巨大的木质扫帚，把地上的凌乱字母扫进一个冒着烟的垃圾桶里”。

请按以下 JSON 格式输出：
{
  "desc": "中文描述：详细阐述你设计的隐喻创意，以及小黑在画面里正在进行的荒诞但合理的具体动作（30-80字）",
  "prompt": "DALLE-3 Image generation prompt: 英文生图提示词。必须是一段连贯的英文描述，用于输入给生图模型。必须严格包含：'16:9 aspect ratio, pure white background, black hand-drawn line art with slight jitter, a solid black silhouette character named Xiaohei with white dot eyes and thin limbs participating in [具体隐喻动作], minimal handwritten annotation in red or orange or blue, clean composition, high contrast, negative space, no gray shadows, grotesque editorial style'"
}

硬性要求：
- 请只返回这个合法的 JSON 对象，不要使用 Markdown 包裹（不要用 \`\`\`json），不要有任何前言后记。
- JSON 属性和字符串值必须使用英文双引号。`;

export interface MetaphorPromptResult {
  desc: string;
  prompt: string;
}

/**
 * 提取 AI 返回内容里的 JSON 部分
 */
function extractJson(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, "").trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    cleaned = fenced[1].trim();
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

/**
 * 第一阶段：利用大模型为项目策划隐喻及生图 Prompt
 */
export async function generateIllustrationPromptWithAi(config: AiConfig, projectName: string, projectDesc: string): Promise<MetaphorPromptResult> {
  const userContent = `项目名称：${projectName}
项目描述：${projectDesc || "暂无背景说明"}`;

  const responseText = await aiComplete({
    config,
    systemPrompt: ILLUSTRATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    maxTokens: 2048,
    temperature: 0.7, // 适当的温度以提高创意性
  });

  try {
    const parsed = JSON.parse(extractJson(responseText));
    if (!parsed.prompt || !parsed.desc) {
      throw new Error("AI 返回的 JSON 结构缺少必要属性");
    }
    return {
      desc: parsed.desc,
      prompt: parsed.prompt,
    };
  } catch (e) {
    console.error("[TASK] Failed to parse AI illustration planning response:", responseText, e);
    // 兜底逻辑
    return {
      desc: "由于 AI 返回格式解析失败，为您自动生成了兜底的隐喻：小黑正在书写关于项目的计划草稿。",
      prompt: `16:9 aspect ratio, pure white background, black hand-drawn line art with slight jitter, a solid black silhouette character named Xiaohei with white dot eyes and thin limbs sketching a draft on a big paper, minimal handwritten annotations in red, clean composition, high contrast, negative space, grotesque editorial style`,
    };
  }
}

/**
 * 第二阶段：向 OpenAI / 兼容服务商发送图片生成请求并获取图片链接
 */
/**
 * 使用 Pollinations AI (Flux) 免 Key 快速生成图片
 */
async function generateWithPollinations(prompt: string): Promise<string> {
  const enhancedPrompt = `${prompt}, black and white lineart, clean white background, high contrast, negative space, minimalist handdrawn style`;
  const url = `https://image.pollinations.ai/p/${encodeURIComponent(enhancedPrompt)}?width=1024&height=1024&nologo=true&private=true&feed=false`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`公共生图接口暂时不可达 (Status: ${response.status})，请稍后重试，或使用下方本地上传。`);
  }
  return url;
}

/**
 * 第二阶段：向 OpenAI / 兼容服务商发送图片生成请求并获取图片链接
 * 如果大模型不支持生图，或者用户的 Key 无效/调用失败，则自动无缝降级到 Pollinations 免 Key 绘图服务
 */
export async function generateIllustrationImageWithAi(config: AiConfig, prompt: string): Promise<string> {
  const provider = config.provider;
  const model = config.model?.toLowerCase() || "";

  // 1. 判断当前大模型服务商是否默认不支持生图
  const isTextOnlyProvider = ["claude", "gemini", "deepseek", "qwen", "ollama"].includes(provider);
  const isImageModel = model.includes("dall") || model.includes("flux") || model.includes("sd") || model.includes("stable") || model.includes("image");
  const isTextModel = model.includes("gpt") || model.includes("claude") || model.includes("deepseek") || model.includes("qwen") || model.includes("llama") || model.includes("m3") || model.includes("abab");

  const shouldFallbackToPublicApi = isTextOnlyProvider || (provider === "custom" && isTextModel && !isImageModel) || !config.apiKey;

  if (shouldFallbackToPublicApi) {
    console.log("[TASK] AI configuration is text-only. Falling back to Pollinations AI.");
    try {
      return await generateWithPollinations(prompt);
    } catch (e: any) {
      throw new Error(`自动降级公共生图服务失败: ${e.message || String(e)}`);
    }
  }

  // 2. 否则，尝试呼叫配置的 API
  let imageEndpoint = config.endpoint;
  if (!imageEndpoint) {
    return await generateWithPollinations(prompt);
  }

  // 尝试规范化 API endpoint 替换为 image 接口
  if (imageEndpoint.endsWith("/chat/completions")) {
    imageEndpoint = imageEndpoint.replace("/chat/completions", "/images/generations");
  } else if (imageEndpoint.endsWith("/v1") || imageEndpoint.endsWith("/v1/")) {
    imageEndpoint = imageEndpoint.replace(/\/v1\/?$/, "/v1/images/generations");
  } else {
    imageEndpoint = imageEndpoint + "/images/generations";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const apiModel = config.provider === "openai" ? "dall-e-3" : config.model || "dall-e-3";

  try {
    const response = await fetch(imageEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: apiModel,
        prompt,
        n: 1,
        size: "1024x1024",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn("[TASK] Image generation API failed, falling back to Pollinations AI. Error:", errText);
      return await generateWithPollinations(prompt);
    }

    const resJson = await response.json();
    const url = resJson?.data?.[0]?.url || resJson?.images?.[0]?.url;
    if (!url) {
      console.warn("[TASK] Image API returned empty url, falling back to Pollinations AI.");
      return await generateWithPollinations(prompt);
    }
    return url;
  } catch (e) {
    console.warn("[TASK] Failed to call configured Image API, falling back to Pollinations AI. Error:", e);
    return await generateWithPollinations(prompt);
  }
}
