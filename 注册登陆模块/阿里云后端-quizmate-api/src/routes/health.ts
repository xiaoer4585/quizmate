import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";

export function registerHealthRoute(app: FastifyInstance, services: AppServices): void {
  app.get("/health", async (_request, reply) => {
    const startedAt = performance.now();
    try {
      await services.db.query("SELECT 1 AS ok");
      return {
        status: "ok",
        database: "ok",
        version: services.version,
        time: new Date().toISOString(),
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt))
      };
    } catch (error) {
      app.log.error({ err: error }, "database health check failed");
      return reply.code(503).send({
        status: "degraded",
        database: "unavailable",
        version: services.version,
        time: new Date().toISOString()
      });
    }
  });
}
