import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { PublicError } from "../errors.js";
import type { ActionInput, AppServices } from "../types.js";

function normalizeInput(request: FastifyRequest): ActionInput {
  const body = request.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PublicError("请求内容无效。", "INVALID_BODY");
  }
  return body as ActionInput;
}

export function registerActionRoutes(app: FastifyInstance, services: AppServices): void {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = normalizeInput(request);
    let action = String(input.action ?? "").trim();
    if (!action && input.pid && input.out_trade_no && input.trade_status && input.sign) action = "epayNotify";
    if (!action && input.payjs_order_id && input.out_trade_no && input.return_code && input.sign) action = "payjsNotify";
    if (!action && input.app_id && input.out_trade_no && input.trade_status && input.sign) action = "alipayNotify";
    if (!action) throw new PublicError("缺少操作类型。", "MISSING_ACTION");
    const actionHandler = services.actions.get(action);
    if (!actionHandler) throw new PublicError("未知操作。", "UNKNOWN_ACTION");
    const data = await actionHandler(input, {
      requestId: request.id,
      clientIp: request.ip,
      db: services.db
    });
    if (["alipayNotify", "payjsNotify", "epayNotify"].includes(action)) {
      const accepted = Boolean(data && typeof data === "object" && !Array.isArray(data) && "accepted" in data && data.accepted);
      return reply.type("text/plain; charset=utf-8").send(accepted ? "success" : "fail");
    }
    return { ok: true, data };
  };

  app.post("/", handler);
  app.post("/study-auth-api", handler);
}
