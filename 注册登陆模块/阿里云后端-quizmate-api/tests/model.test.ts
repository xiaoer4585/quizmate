import { describe, expect, it } from "vitest";
import { PublicError } from "../src/errors.js";
import { parseModelResult } from "../src/services/model.js";

describe("model result parser", () => {
  it("parses fenced compatible JSON and normalizes answer items", () => {
    const result = parseModelResult('```json\n{"items":[{"questionNo":"10","summary":"题目10","answer":"B","explanation":"因为..."}],"note":"仅供学习"}\n```');
    expect(result).toEqual({
      items: [{ questionNo: "10", summary: "题目10", answer: "B", explanation: "因为..." }],
      note: "仅供学习"
    });
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
});
