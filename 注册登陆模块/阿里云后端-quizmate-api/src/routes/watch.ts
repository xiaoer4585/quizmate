import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { PublicError } from "../errors.js";
import { createWatchActions, type WatchDependencies } from "../watch/actions.js";

export function registerWatchRoutes(app: FastifyInstance, dependencies: WatchDependencies): void {
  const actions = createWatchActions(dependencies);
  app.post("/watch-api", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const input = request.body;
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new PublicError("请求内容无效。", "INVALID_BODY");
      }
      const action = String((input as Record<string, unknown>).action ?? "").trim();
      const handler = actions.get(action);
      if (!handler) throw new PublicError("不支持的操作。", "UNKNOWN_WATCH_ACTION");
      const data = await handler(input as Record<string, unknown>);
      return { ok: true, data };
    } catch (error) {
      if (error instanceof PublicError) {
        return reply.code(error.statusCode >= 500 ? error.statusCode : 400).send({ ok: false, code: error.code, error: error.message });
      }
      request.log.error({ err: error }, "watch request failed");
      return reply.code(500).send({ ok: false, code: "WATCH_INTERNAL_ERROR", error: "服务暂时不可用，请稍后重试。" });
    }
  });
}
