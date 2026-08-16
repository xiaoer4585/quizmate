import type { FastifyInstance, FastifyRequest } from "fastify";
import { PublicError } from "../errors.js";
import type { ActionInput, AppServices } from "../types.js";

const actionByProvider = {
  alipay: "alipayNotify",
  payjs: "payjsNotify",
  epay: "epayNotify"
} as const;

function callbackInput(request: FastifyRequest): ActionInput {
  const source = request.method === "GET" ? request.query : request.body;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new PublicError("支付回调内容无效。", "INVALID_PAYMENT_CALLBACK");
  }
  return source as ActionInput;
}

export function registerPaymentRoutes(app: FastifyInstance, services: AppServices): void {
  const handler = async (request: FastifyRequest<{ Params: { provider: string } }>, reply: { type(value: string): { send(value: string): unknown } }) => {
    const provider = request.params.provider as keyof typeof actionByProvider;
    const action = actionByProvider[provider];
    if (!action) return reply.type("text/plain; charset=utf-8").send("fail");
    const actionHandler = services.actions.get(action);
    if (!actionHandler) return reply.type("text/plain; charset=utf-8").send("fail");
    try {
      const result = await actionHandler(callbackInput(request), {
        requestId: request.id,
        clientIp: request.ip,
        db: services.db
      });
      const accepted = Boolean(result && typeof result === "object" && !Array.isArray(result) && "accepted" in result && result.accepted);
      return reply.type("text/plain; charset=utf-8").send(accepted ? "success" : "fail");
    } catch (error) {
      request.log.error({ err: error, provider }, "payment callback failed");
      return reply.type("text/plain; charset=utf-8").send("fail");
    }
  };

  app.get<{ Params: { provider: string } }>("/payments/:provider/notify", handler);
  app.post<{ Params: { provider: string } }>("/payments/:provider/notify", handler);
}
