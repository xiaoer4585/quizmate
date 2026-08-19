import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config.js";
import { PublicError } from "../src/errors.js";
import { createAnalysisModel, parseModelResult } from "../src/services/model.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("model result parser", () => {
  it("parses fenced compatible JSON and normalizes answer items", () => {
    const result = parseModelResult('```json\n{"items":[{"questionNo":"10","summary":"题目10","answer":"B","explanation":"因为..."}],"note":"仅供学习"}\n```');
    expect(result).toEqual({
      items: [{ questionNo: "10", summary: "题目10", answer: "B", explanation: "因为..." }],
      note: "仅供学习"
    });
  });

  it("preserves programming answer fields and code", () => {
    const result = parseModelResult(JSON.stringify({
      items: [{
        questionNo: "206",
        summary: "题目206",
        answer: "实现反转链表",
        explanation: "使用双指针迭代。",
        language: "Go",
        code: "func reverseList(head *ListNode) *ListNode { return head }",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)"
      }]
    }));
    expect(result.items[0]).toMatchObject({
      questionNo: "206",
      language: "Go",
      code: expect.stringContaining("reverseList"),
      answer: expect.stringContaining("reverseList"),
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)"
    });
  });

  it("falls back to a code answer when a vision model omits the JSON wrapper", () => {
    const result = parseModelResult("```go\nfunc reverseList(head *ListNode) *ListNode { return head }\n```");
    expect(result.items[0].code).toContain("reverseList");
    expect(result.items[0].answer).toContain("reverseList");
  });

  it("rejects malformed or empty model output", () => {
    for (const content of ["not json", "{}", '{"items":[{}]}']) {
      try {
        parseModelResult(content);
        throw new Error("expected parseModelResult to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(PublicError);
        expect((error as PublicError).code).toBe("INVALID_MODEL_RESULT");
      }
    }
  });

  it("accepts a plain-text interview answer when the upstream model ignores JSON", () => {
    const result = parseModelResult("我有三年产品经验，曾主导跨团队项目并取得可量化成果。", { allowInterviewText: true });
    expect(result.items[0].answer).toContain("三年产品经验");
  });

  it("repairs interview JSON whose answer string contains raw newlines (2026-08-19 production failure)", () => {
    const content = '{"items":[{"summary":"面试官询问Redis所有数据结构、底层实现及各自好处","answer":"我先整理一下我对Redis数据结构、底层实现和优势的理解。\n1、Redis基于内存，读写性能高。\n2、支持多种数据结构。","explanation":"要点"}]}';
    const result = parseModelResult(content, { allowInterviewText: true });
    expect(result.items[0].answer).toContain("我先整理一下");
    expect(result.items[0].answer).toContain("1、Redis基于内存");
    expect(result.items[0].answer).toContain("\n");
  });

  it("repairs exam JSON with raw control characters inside string values", () => {
    const content = '{"items":[{"summary":"题目1","answer":"第1题答案是：B第二个","explanation":"选项B正确。\n原因：\t直接套用公式。","code":"if (a > b) {\n  return a;\n}"}]}';
    const result = parseModelResult(content);
    expect(result.items[0].explanation).toContain("直接套用公式");
    expect(result.items[0].code).toContain("return a;");
  });

  it("keeps valid JSON untouched and does not escape whitespace outside strings", () => {
    const content = '{\n  "items": [\n    {"summary": "题目1", "answer": "B"}\n  ],\n  "note": "ok"\n}';
    const result = parseModelResult(content);
    expect(result.items[0].answer).toBe("B");
    expect(result.note).toBe("ok");
  });

  it("falls back to the raw interview answer when the JSON cannot be repaired", () => {
    // 字符串内未转义英文引号，控制字符转义无法修复，但面试模式应降级为原文而不是 502
    const content = '{"items":[{"answer":"我认为"Redis"很快，适合缓存场景"}]}';
    const result = parseModelResult(content, { allowInterviewText: true });
    expect(result.items[0].answer).toContain("Redis");
    expect(result.items[0].answer).toContain("缓存场景");
  });

  it("normalizes a root-level interview answer object", () => {
    const result = parseModelResult('{"answer":"我会结合简历介绍与岗位最匹配的经历。"}', { allowInterviewText: true });
    expect(result.items[0].answer).toContain("结合简历");
  });

  it("routes interview requests through the configured low-latency voice model", async () => {
    let calledUrl = "";
    let calledBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"items":[{"summary":"自我介绍","answer":"回答","explanation":"要点"}]}' } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const runModel = createAnalysisModel(
      {} as AppConfig,
      async () => ({ baseUrl: "https://text.example", apiKey: "text-key", model: "ark-code-latest" }),
      undefined,
      async () => ({ baseUrl: "https://fast.example", apiPath: "/chat/completions", apiFormat: "openai", apiKey: "fast-key", model: "doubao-seed-2.0-mini" })
    );

    const result = await runModel({
      prompt: "请介绍一下自己",
      pageContext: null,
      screenshot: "",
      source: "interview",
      mode: "interview"
    });

    expect(calledUrl).toBe("https://fast.example/chat/completions");
    expect(calledBody.model).toBe("doubao-seed-2.0-mini");
    // 面试模式输出双层回答（答题思路 + 详细回答），max_tokens 由 900 提升至 1600
    expect(calledBody.max_tokens).toBe(1600);
    expect(calledBody.thinking).toEqual({ type: "disabled" });
    expect((calledBody.messages as Array<{ content: string }>)[0].content).toContain("实时面试回答助手");
    expect((calledBody.messages as Array<{ content: string }>)[0].content).toContain("答题思路");
    expect((calledBody.messages as Array<{ content: string }>)[0].content).toContain("详细回答");
    expect(result.items[0].answer).toBe("回答");
  });
});
