import { PublicError } from "../errors.js";
import { callCuotiModel } from "../services/model.js";
import type { ActionDependencies, ActionHandler, ActionInput } from "../types.js";

/** 错题集默认提示词 */
export const DEFAULT_CUOTI_PROMPTS = {
  restoreQuestion:
    "根据我拍照的照片，帮我还原题目为文本形式。如果里面有几何图形、函数图像、表格、坐标系或化学方程式，请尽量用文本、ASCII图或结构化描述按照原图样式还原。如果题目里面有学生之前做过的答案、批改痕迹、圈画或草稿，请去除这些内容，只保留错题本身。最后返回：学科、疑似年级、题目文本、图形/表格说明。",
  linkKnowledge:
    '你是一名熟悉中国大陆教材体系的教研老师。请根据学生所在地区、学段、年级、学科、教材版本以及错题文本，优先匹配教材中的知识点；如果后台教材目录为空或无法匹配，请基于题目内容自行判断最可能的知识点。输出：知识点名称、所在单元/章节、课本核心内容、前置知识、易错点、建议复习路径，并标注"教材匹配"或"AI推断"。',
  explainQuestion:
    "你是一名耐心的中小学老师。请根据错题文本生成详细讲解：1. 题意拆解；2. 已知条件和要求；3. 解题思路；4. 分步推导；5. 正确答案；6. 易错原因；7. 同类题方法总结。语言适合学生听懂，便于后续文本转语音朗读。",
  similarQuestion:
    '你是一名命题老师。请根据错题的知识点、题型、难度生成相似但数值、情境或问法不同的新题。输出JSON数组，格式为 [{"question":"题目","answer":"参考答案","knowledge":"知识点","difficulty":"难度"}]。',
  testPaper:
    '你是一位试卷命题老师。请根据错题生成一份结构清晰的中文练习卷。输出 JSON，格式为 {"title":"试卷标题","questions":[{"subject":"学科","content":"题目","answer":"答案"}]}，不要添加额外说明。',
};

function cuotiSettings(deps: ActionDependencies) {
  if (!deps.settings) throw new PublicError("运行配置服务尚未初始化。", "SETTINGS_NOT_CONFIGURED", 503);
  return deps.settings;
}

/** 内部密钥认证 */
function requireInternalSecret(input: ActionInput): void {
  const expected = String(process.env.CUOTI_INTERNAL_SECRET ?? "");
  const supplied = String(input.internalSecret ?? "");
  if (!expected || !supplied || expected !== supplied) {
    throw new PublicError("内部认证失败。", "INTERNAL_AUTH_FAILED", 403);
  }
}

function text(value: unknown, fallback = "", max = 20_000): string {
  return String(value ?? fallback).trim().slice(0, max);
}

export function createCuotiActions(deps: ActionDependencies): Map<string, ActionHandler> {
  const actions = new Map<string, ActionHandler>();

  // ===== 配置管理（管理员认证）=====

  actions.set("adminGetCuotiConfig", async (input) => {
    const { authenticateAdmin } = await import("./admin.js");
    await authenticateAdmin(deps, input);
    const value = await cuotiSettings(deps).get("cuoti_config");
    return {
      restorePrompt: text(value.restorePrompt, DEFAULT_CUOTI_PROMPTS.restoreQuestion),
      explainPrompt: text(value.explainPrompt, DEFAULT_CUOTI_PROMPTS.explainQuestion),
      knowledgePrompt: text(value.knowledgePrompt, DEFAULT_CUOTI_PROMPTS.linkKnowledge),
      similarPrompt: text(value.similarPrompt, DEFAULT_CUOTI_PROMPTS.similarQuestion),
      paperPrompt: text(value.paperPrompt, DEFAULT_CUOTI_PROMPTS.testPaper),
      updatedAt: text(value.updatedAt),
    };
  });

  actions.set("adminSetCuotiConfig", async (input) => {
    const { authenticateAdmin } = await import("./admin.js");
    await authenticateAdmin(deps, input);
    const current = await cuotiSettings(deps).get("cuoti_config");
    const next: Record<string, unknown> = { ...current };
    for (const key of ["restorePrompt", "explainPrompt", "knowledgePrompt", "similarPrompt", "paperPrompt"]) {
      if (key in input) next[key] = text(input[key]);
    }
    next.updatedAt = new Date().toISOString();
    await cuotiSettings(deps).set("cuoti_config", next, "admin");
    return {
      restorePrompt: text(next.restorePrompt, DEFAULT_CUOTI_PROMPTS.restoreQuestion),
      explainPrompt: text(next.explainPrompt, DEFAULT_CUOTI_PROMPTS.explainQuestion),
      knowledgePrompt: text(next.knowledgePrompt, DEFAULT_CUOTI_PROMPTS.linkKnowledge),
      similarPrompt: text(next.similarPrompt, DEFAULT_CUOTI_PROMPTS.similarQuestion),
      paperPrompt: text(next.paperPrompt, DEFAULT_CUOTI_PROMPTS.testPaper),
      updatedAt: text(next.updatedAt),
    };
  });

  // ===== AI 功能（内部密钥认证）=====

  const loadPrompts = async () => {
    const value = await cuotiSettings(deps).get("cuoti_config");
    return {
      restorePrompt: text(value.restorePrompt, DEFAULT_CUOTI_PROMPTS.restoreQuestion),
      explainPrompt: text(value.explainPrompt, DEFAULT_CUOTI_PROMPTS.explainQuestion),
      knowledgePrompt: text(value.knowledgePrompt, DEFAULT_CUOTI_PROMPTS.linkKnowledge),
      similarPrompt: text(value.similarPrompt, DEFAULT_CUOTI_PROMPTS.similarQuestion),
      paperPrompt: text(value.paperPrompt, DEFAULT_CUOTI_PROMPTS.testPaper),
    };
  };

  /** 错题还原（图片 -> 文本） */
  actions.set("cuotiRestore", async (input) => {
    requireInternalSecret(input);
    const prompts = await loadPrompts();
    const screenshot = String(input.imageBase64 || input.screenshot || "");
    if (!screenshot) throw new PublicError("未收到图片数据。", "NO_IMAGE");

    // 如果是 cloud:// fileID，无法直接使用，需要前端转 base64 后传入
    const dataUrl = screenshot.startsWith("data:") || screenshot.startsWith("http")
      ? screenshot
      : `data:image/jpeg;base64,${screenshot}`;

    const content = await callCuotiModel(
      deps.config,
      () => deps.settings!.get("model_config"),
      () => deps.settings!.get("image_model_config"),
      {
        prompt: String(input.prompt || ""),
        screenshot: dataUrl,
        systemPrompt: prompts.restorePrompt,
      }
    );
    return { text: content };
  });

  /** 错题讲解 */
  actions.set("cuotiExplain", async (input) => {
    requireInternalSecret(input);
    const prompts = await loadPrompts();
    const context = input.context as Record<string, unknown> | null;
    const userMessage = formatUserMessage(input.question, input.knowledge, context);
    const content = await callCuotiModel(
      deps.config,
      () => deps.settings!.get("model_config"),
      () => deps.settings!.get("image_model_config"),
      { prompt: userMessage, systemPrompt: prompts.explainPrompt }
    );
    return { text: content };
  });

  /** 知识点关联 */
  actions.set("cuotiKnowledge", async (input) => {
    requireInternalSecret(input);
    const prompts = await loadPrompts();
    const context = input.context as Record<string, unknown> | null;
    const userMessage = formatUserMessage(null, input.knowledge, context);
    const content = await callCuotiModel(
      deps.config,
      () => deps.settings!.get("model_config"),
      () => deps.settings!.get("image_model_config"),
      { prompt: userMessage, systemPrompt: prompts.knowledgePrompt }
    );
    return { text: content };
  });

  /** 举一反三 */
  actions.set("cuotiSimilar", async (input) => {
    requireInternalSecret(input);
    const prompts = await loadPrompts();
    const count = Math.max(1, Math.min(Number(input.count) || 3, 10));
    const context = input.context as Record<string, unknown> | null;
    const userMessage = [
      formatUserMessage(null, input.knowledge, context),
      `题目数量：${count}`,
    ].filter(Boolean).join("\n\n");
    const content = await callCuotiModel(
      deps.config,
      () => deps.settings!.get("model_config"),
      () => deps.settings!.get("image_model_config"),
      { prompt: userMessage, systemPrompt: prompts.similarPrompt, temperature: 0.6 }
    );
    return { text: content };
  });

  /** 试卷生成 */
  actions.set("cuotiPaper", async (input) => {
    requireInternalSecret(input);
    const prompts = await loadPrompts();
    const count = Math.max(1, Math.min(Number(input.count) || 5, 20));
    const includeAnswer = input.includeAnswer !== false;
    const questions = Array.isArray(input.questions) ? input.questions.slice(0, 20) : [];
    const context = input.context as Record<string, unknown> | null;
    const userMessage = [
      formatUserMessage(null, null, context),
      `模式：${input.mode === "similar" ? "举一反三" : "错题巩固"}`,
      `题目数量：${count}`,
      `是否包含答案：${includeAnswer ? "是" : "否"}`,
      `错题材料：${JSON.stringify(questions)}`,
    ].filter(Boolean).join("\n\n");
    const content = await callCuotiModel(
      deps.config,
      () => deps.settings!.get("model_config"),
      () => deps.settings!.get("image_model_config"),
      { prompt: userMessage, systemPrompt: prompts.paperPrompt, temperature: 0.5, maxTokens: 3000 }
    );
    return { text: content };
  });

  return actions;
}

/** 格式化用户消息，包含学习上下文 */
function formatUserMessage(question: unknown, knowledge: unknown, context: Record<string, unknown> | null): string {
  const parts: string[] = [];
  if (context) {
    const ctx = formatLearnerContext(context);
    if (ctx) parts.push(ctx);
  }
  if (question) parts.push(`题目：${String(question)}`);
  if (knowledge) parts.push(`知识点：${String(knowledge)}`);
  return parts.filter(Boolean).join("\n\n");
}

function formatLearnerContext(context: Record<string, unknown>): string {
  const parts: string[] = [];
  if (context.province) parts.push(`地区：${context.province}${context.city ? ` ${context.city}` : ""}`);
  if (context.stage) parts.push(`学段：${context.stage}`);
  if (context.grade) parts.push(`年级：${context.grade}`);
  if (context.subject) parts.push(`学科：${context.subject}`);
  if (context.textbook) parts.push(`教材版本：${context.textbook}`);
  return parts.length ? parts.join("\n") : "";
}
