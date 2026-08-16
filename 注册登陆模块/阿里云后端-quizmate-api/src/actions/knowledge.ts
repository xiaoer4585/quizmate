import crypto from "node:crypto";
import { PublicError } from "../errors.js";
import { hashToken } from "../security/crypto.js";
import { requireAdmin } from "../services/admin.js";
import { authenticateAdmin } from "./admin.js";
import type { ActionDependencies, ActionHandler, ActionInput } from "../types.js";
import { normalizeDeviceId, requireActiveLicense } from "./licenses.js";

interface CompatibilityOwner {
  ownerType: "account" | "legacy_license";
}

async function requireOwner(deps: ActionDependencies, input: ActionInput): Promise<CompatibilityOwner> {
  const tokenHash = hashToken(input.accountToken ?? input.token);
  if (tokenHash) {
    const result = await deps.db.query<{ account_id: string; status: string }>(
      `SELECT a.account_id, a.status FROM account_sessions s JOIN accounts a USING(account_id)
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now())`,
      [tokenHash]
    );
    const account = result.rows[0];
    if (!account) throw new PublicError("登录状态已失效，请重新登录。", "SESSION_EXPIRED", 401);
    if (account.status !== "active") throw new PublicError("该账户当前不可用。", "ACCOUNT_DISABLED", 403);
    return { ownerType: "account" };
  }
  await requireActiveLicense(deps, input);
  normalizeDeviceId(input.deviceId);
  return { ownerType: "legacy_license" };
}

function safeFileName(value: unknown): string {
  return String(value ?? "knowledge.txt")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "knowledge.txt";
}

function estimatedBase64Bytes(input: ActionInput): number {
  const raw = String(input.fileBase64 ?? input.base64 ?? input.data ?? "")
    .replace(/^data:[^;]+;base64,/i, "")
    .replace(/\s+/g, "");
  if (!raw) return 0;
  return Math.max(0, Math.floor(raw.length * 0.75) - (raw.endsWith("==") ? 2 : raw.endsWith("=") ? 1 : 0));
}

function compatibilityDocument(input: ActionInput, owner: CompatibilityOwner) {
  const now = new Date().toISOString();
  return {
    docId: `local_${crypto.randomUUID()}`,
    fileName: safeFileName(input.fileName),
    mimeType: String(input.mimeType ?? "application/octet-stream").slice(0, 160),
    size: estimatedBase64Bytes(input),
    textLength: 0,
    chunkCount: 0,
    textPreview: "",
    createdAt: now,
    updatedAt: now,
    ownerType: owner.ownerType === "account" ? "account" : "license",
    localOnly: true
  };
}

export function createKnowledgeActions(deps: ActionDependencies): Map<string, ActionHandler> {
  const actions = new Map<string, ActionHandler>();

  actions.set("uploadKnowledge", async (input) => {
    const owner = await requireOwner(deps, input);
    return { document: compatibilityDocument(input, owner), localOnly: true };
  });

  actions.set("listKnowledge", async (input) => {
    await requireOwner(deps, input);
    return { items: [], localOnly: true };
  });

  actions.set("deleteKnowledge", async (input) => {
    await requireOwner(deps, input);
    const docId = String(input.docId ?? "").trim();
    if (!docId) throw new PublicError("请选择知识库文件。", "KNOWLEDGE_ID_REQUIRED");
    return { deleted: true, document: { docId, localOnly: true }, localOnly: true };
  });

  actions.set("adminListKnowledge", async (input) => {
    await authenticateAdmin(deps, input);
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize ?? input.limit ?? 20))));
    return { items: [], page: 1, pageSize, total: 0, totalPages: 1, localOnly: true };
  });

  actions.set("adminDeleteKnowledge", async (input) => {
    await authenticateAdmin(deps, input);
    const docId = String(input.docId ?? "").trim();
    if (!docId) throw new PublicError("请选择知识库文件。", "KNOWLEDGE_ID_REQUIRED");
    return { deleted: true, document: { docId, localOnly: true }, localOnly: true };
  });

  return actions;
}
