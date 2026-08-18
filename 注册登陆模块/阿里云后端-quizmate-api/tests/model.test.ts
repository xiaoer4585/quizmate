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
    expect(calledBody.max_tokens).toBe(900);
    expect(calledBody.thinking).toEqual({ type: "disabled" });
    expect((calledBody.messages as Array<{ content: string }>)[0].content).toContain("实时面试回答助手");
    expect(result.items[0].answer).toBe("回答");
  });
});
