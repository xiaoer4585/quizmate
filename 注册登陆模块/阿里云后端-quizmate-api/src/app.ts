import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { PublicError } from "./errors.js";
import { registerActionRoutes } from "./routes/action.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerPaymentRoutes } from "./routes/payments.js";
import { registerWatchRoutes } from "./routes/watch.js";
import type { AppServices } from "./types.js";

export async function buildApp(config: AppConfig, services: AppServices): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    bodyLimit: config.BODY_LIMIT_BYTES,
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body.password",
          "req.body.newPassword",
          "req.body.code",
          "req.body.emailCode",
          "req.body.token",
          "req.body.accountToken",
          "req.body.screenshot",
          "req.body.fileBase64"
        ],
        censor: "[REDACTED]"
      }
    }
  });

  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
    try {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new PublicError("请求来源不允许。", "CORS_ORIGIN_DENIED", 403), false);
    },
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"]
  });
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW
  });

  registerHealthRoute(app, services);
  registerPaymentRoutes(app, services);
  registerActionRoutes(app, services);
  if (services.watch) registerWatchRoutes(app, services.watch);

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ ok: false, code: "NOT_FOUND", error: "接口不存在。" });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof PublicError) {
      return reply.code(error.statusCode).send({ ok: false, code: error.code, error: error.message });
    }
    request.log.error({ err: error }, "request failed");
    return reply.code(500).send({ ok: false, code: "INTERNAL_ERROR", error: "服务暂时不可用。" });
  });

  return app;
}
