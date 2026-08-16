import crypto from "node:crypto";
import type { Database } from "../db.js";
import { PublicError } from "../errors.js";
import { hashToken } from "../security/crypto.js";
import { WatchStore, type WatchDocument } from "./store.js";

export const WATCH_COLLECTIONS = {
  packages: "watch_packages",
  sources: "watch_sources",
  subscriptions: "watch_subscriptions",
  intents: "watch_user_intents",
  jobs: "watch_jobs",
  snapshots: "watch_source_snapshots",
  changes: "watch_source_changes",
  sessions: "watch_site_sessions",
  applications: "watch_applications",
  applicationEvents: "watch_application_events"
} as const;

type WatchInput = Record<string, unknown> & { action?: unknown };
type WatchResult = Record<string, unknown> | unknown[];
type WatchAction = (input: WatchInput) => Promise<WatchResult>;

interface WatchAccount {
  accountId: string;
  email: string;
  status: string;
}

export interface WatchDependencies {
  db: Database;
  workerSecret: string;
  cookieMasterKey: string;
}

function text(value: unknown, max = 200): string {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function arrayOfText(value: unknown, max: number, length: number): string[] {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/[,，\n]/);
  return values.map((item) => text(item, length)).filter(Boolean).slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function iso(): string {
  return new Date().toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function sha256(value: unknown): string {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
}

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeUrl(raw: unknown): string {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    throw new PublicError("请输入有效网址。", "INVALID_URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new PublicError("只支持 HTTP/HTTPS 网页。", "INVALID_URL");
  url.hash = "";
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "spm", "from"].forEach((key) => url.searchParams.delete(key));
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function normalizeDomain(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]!.replace(/^\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) throw new PublicError("请输入有效站点域名。", "INVALID_DOMAIN");
  return value;
}

function normalizeStage(value: unknown): string {
  const stage = String(value ?? "").toLowerCase();
  return ["saved", "applied", "screening", "assessment", "interview", "offer", "rejected", "withdrawn"].includes(stage)
    ? stage
    : "applied";
}

function stageLabel(stage: unknown): string {
  return ({
    saved: "待投递",
    applied: "已投递",
    screening: "简历筛选",
    assessment: "笔试/测评",
    interview: "面试",
    offer: "Offer",
    rejected: "未通过",
    withdrawn: "已终止"
  } as Record<string, string>)[normalizeStage(stage)]!;
}

function safeChildUrl(raw: unknown, base: unknown): string {
  try {
    const url = new URL(String(raw ?? ""), String(base ?? ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function stripInternal(document: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...document };
  for (const key of ["_id", "accountId", "ownerAccountId", "dedupeKey", "encrypted", "leaseUntil"]) delete copy[key];
  return copy;
}

function publicSource(source: Record<string, unknown>, packageId?: unknown): Record<string, unknown> {
  return stripInternal({ ...source, ...(packageId ? { packageId } : {}) });
}

function publicIntent(intent: Record<string, unknown>): Record<string, unknown> {
  return { text: intent.text, structured: intent.structured ?? {}, updatedAt: intent.updatedAt };
}

function publicSession(session: Record<string, unknown>): Record<string, unknown> {
  return {
    sessionId: session.sessionId,
    domain: session.domain,
    label: session.label,
    cookieCount: session.cookieCount,
    expiresAt: session.expiresAt,
    status: session.status,
    health: session.health ?? "unchecked",
    lastValidatedAt: session.lastValidatedAt ?? null,
    updatedAt: session.updatedAt
  };
}

export function createWatchActions(deps: WatchDependencies): ReadonlyMap<string, WatchAction> {
  const store = new WatchStore(deps.db);

  async function requireAccount(input: WatchInput): Promise<WatchAccount> {
    const tokenHash = hashToken(input.accountToken ?? input.token);
    if (!tokenHash) throw new PublicError("请先登录。", "WATCH_LOGIN_REQUIRED", 401);
    const result = await deps.db.query<{ account_id: string; email: string; status: string }>(
      `SELECT a.account_id, a.email, a.status
         FROM account_sessions s JOIN accounts a USING(account_id)
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL
          AND (s.expires_at IS NULL OR s.expires_at > now())
        LIMIT 1`,
      [tokenHash]
    );
    const account = result.rows[0];
    if (!account || account.status !== "active") throw new PublicError("登录状态已失效，请重新登录。", "WATCH_SESSION_EXPIRED", 401);
    return { accountId: account.account_id, email: account.email, status: account.status };
  }

  function requireWorker(input: WatchInput): void {
    const actual = String(input.workerSecret ?? "");
    if (!deps.workerSecret || !actual || !secureEqual(deps.workerSecret, actual)) {
      throw new PublicError("Worker 无权访问。", "WATCH_WORKER_UNAUTHORIZED", 403);
    }
  }

  async function owned(collection: string, accountId: string, limit: number): Promise<Record<string, unknown>[]> {
    return (await store.list(collection, { accountId }, limit)).map(stripInternal);
  }

  async function listWatchSourcesFor(accountId: string): Promise<Record<string, unknown>[]> {
    const subscriptions = await store.list(WATCH_COLLECTIONS.subscriptions, { accountId }, 500);
    const sources = await store.list(WATCH_COLLECTIONS.sources, {}, 1000);
    const sourceMap = new Map(sources.map((source) => [String(source.sourceId ?? ""), source]));
    return subscriptions
      .map((subscription) => {
        const source = sourceMap.get(String(subscription.sourceId ?? ""));
        return source ? publicSource(source, subscription.packageId) : null;
      })
      .filter((item): item is Record<string, unknown> => Boolean(item));
  }

  async function listJobsFor(accountId: string): Promise<Record<string, unknown>[]> {
    const sourceIds = new Set((await listWatchSourcesFor(accountId)).map((source) => String(source.sourceId ?? "")));
    const jobs = await store.list(WATCH_COLLECTIONS.jobs, {}, 500, "lastSeenAt", true);
    return jobs.filter((job) => sourceIds.has(String(job.sourceId ?? ""))).slice(0, 200).map(stripInternal);
  }

  async function addSourceFor(account: WatchAccount, input: WatchInput): Promise<Record<string, unknown>> {
    const normalizedUrl = normalizeUrl(input.url);
    const packageId = text(input.packageId, 80);
    if (!packageId) throw new PublicError("请选择监控包。", "WATCH_PACKAGE_REQUIRED");
    const pack = await store.findOne(WATCH_COLLECTIONS.packages, { accountId: account.accountId, packageId });
    if (!pack) throw new PublicError("监控包不存在。", "WATCH_PACKAGE_NOT_FOUND");
    const purpose = ["discovery", "application", "generic"].includes(String(input.purpose)) ? String(input.purpose) : "discovery";
    const isPrivate = input.fetchMode === "session" || purpose === "application";
    const dedupeKey = sha256(isPrivate ? `${normalizedUrl}|${account.accountId}` : normalizedUrl);
    let source = await store.findOne(WATCH_COLLECTIONS.sources, { dedupeKey });
    const now = iso();
    if (!source) {
      const url = new URL(normalizedUrl);
      source = await store.add(WATCH_COLLECTIONS.sources, {
        sourceId: crypto.randomUUID(),
        normalizedUrl,
        dedupeKey,
        url: normalizedUrl,
        hostname: url.hostname.toLowerCase(),
        title: text(input.title, 120) || url.hostname,
        purpose,
        core: Boolean(input.core),
        ownerAccountId: isPrivate ? account.accountId : "",
        applicationId: text(input.applicationId, 80),
        monitorConfig: purpose === "generic" ? {
          mode: ["full", "text", "keyword"].includes(String(input.monitorMode)) ? input.monitorMode : "text",
          keywords: arrayOfText(input.keywords, 30, 80),
          selector: text(input.selector, 300)
        } : null,
        fetchMode: ["http", "browser", "session"].includes(String(input.fetchMode)) ? input.fetchMode : "http",
        status: "pending",
        intervalMinutes: clamp(Number(input.intervalMinutes ?? pack.intervalMinutes ?? 30), 30, 1440),
        nextRunAt: now,
        lastCheckedAt: null,
        lastChangedAt: null,
        leaseUntil: null,
        createdAt: now,
        updatedAt: now
      });
    }
    const existing = await store.findOne(WATCH_COLLECTIONS.subscriptions, {
      accountId: account.accountId,
      packageId,
      sourceId: source.sourceId
    });
    if (!existing) {
      await store.add(WATCH_COLLECTIONS.subscriptions, {
        subscriptionId: crypto.randomUUID(),
        accountId: account.accountId,
        packageId,
        sourceId: source.sourceId,
        createdAt: now
      });
    }
    return publicSource(source, packageId);
  }

  async function ensureSystemPackage(account: WatchAccount, name: string, systemType: string): Promise<WatchDocument> {
    const existing = await store.findOne(WATCH_COLLECTIONS.packages, { accountId: account.accountId, systemType });
    if (existing) return existing;
    const now = iso();
    return store.add(WATCH_COLLECTIONS.packages, {
      packageId: crypto.randomUUID(), accountId: account.accountId, name, systemType,
      template: systemType, description: "系统自动维护", intervalMinutes: 30,
      status: "active", createdAt: now, updatedAt: now
    });
  }

  async function addApplicationEvent(accountId: string, applicationId: string, stage: string, note: string, createdAt: string): Promise<void> {
    await store.add(WATCH_COLLECTIONS.applicationEvents, {
      eventId: crypto.randomUUID(), accountId, applicationId, stage,
      stageLabel: stageLabel(stage), note, createdAt
    });
  }

  async function getWatchBootstrap(input: WatchInput): Promise<WatchResult> {
    const account = await requireAccount(input);
    const [packages, sources, jobs, sessions, intents, applications, applicationEvents] = await Promise.all([
      owned(WATCH_COLLECTIONS.packages, account.accountId, 100),
      listWatchSourcesFor(account.accountId),
      listJobsFor(account.accountId),
      owned(WATCH_COLLECTIONS.sessions, account.accountId, 100),
      store.findOne(WATCH_COLLECTIONS.intents, { accountId: account.accountId }),
      owned(WATCH_COLLECTIONS.applications, account.accountId, 200),
      owned(WATCH_COLLECTIONS.applicationEvents, account.accountId, 1000)
    ]);
    return {
      packages,
      sources,
      jobs,
      sessions: sessions.map(publicSession),
      intent: intents ? publicIntent(intents) : null,
      applications,
      applicationEvents
    };
  }

  async function createWatchPackage(input: WatchInput): Promise<WatchResult> {
    const account = await requireAccount(input);
    const name = text(input.name, 80);
    if (!name) throw new PublicError("请输入监控包名称。", "WATCH_PACKAGE_NAME_REQUIRED");
    const now = iso();
    const pack = await store.add(WATCH_COLLECTIONS.packages, {
      packageId: crypto.randomUUID(), accountId: account.accountId, name,
      template: text(input.template || "通用", 30), description: text(input.description, 300),
      intervalMinutes: clamp(Number(input.intervalMinutes ?? 30), 30, 1440),
      status: "active", createdAt: now, updatedAt: now
    });
    const urls = Array.isArray(input.urls) ? input.urls : String(input.urls ?? "").split(/\r?\n/);
    let addedSources = 0;
    for (const url of urls.slice(0, 200)) {
      if (!String(url).trim()) continue;
      await addSourceFor(account, { ...input, url, packageId: pack.packageId });
      addedSources += 1;
    }
    return { package: stripInternal(pack), addedSources };
  }

  async function deleteWatchPackage(input: WatchInput): Promise<WatchResult> {
    const account = await requireAccount(input);
    const packageId = text(input.packageId, 80);
    const pack = await store.findOne(WATCH_COLLECTIONS.packages, { accountId: account.accountId, packageId });
    if (!pack) throw new PublicError("监控包不存在。", "WATCH_PACKAGE_NOT_FOUND");
    await store.removeById(WATCH_COLLECTIONS.packages, pack._id);
    await store.removeWhere(WATCH_COLLECTIONS.subscriptions, { accountId: account.accountId, packageId });
    return { deleted: true };
  }

  async function deleteWatchSource(input: WatchInput): Promise<WatchResult> {
    const account = await requireAccount(input);
    const sourceId = text(input.sourceId, 80);
    const packageId = text(input.packageId, 80);
    const where: Record<string, unknown> = { accountId: account.accountId, sourceId };
    if (packageId) where.packageId = packageId;
    const subscription = await store.findOne(WATCH_COLLECTIONS.subscriptions, where);
    if (!subscription) throw new PublicError("网站不在该信息源卡片中。", "WATCH_SOURCE_NOT_FOUND");
    if (input.manual !== false && packageId) {
      const [pack, source] = await Promise.all([
        store.findOne(WATCH_COLLECTIONS.packages, { accountId: account.accountId, packageId }),
        store.findOne(WATCH_COLLECTIONS.sources, { sourceId })
      ]);
      if (pack && source?.normalizedUrl) {
        const excluded = Array.isArray(pack.excludedSourceKeys) ? pack.excludedSourceKeys.map(String) : [];
        const excludedSourceKeys = [...new Set([...excluded, sha256(source.normalizedUrl)])].slice(-500);
        await store.updateById(WATCH_COLLECTIONS.packages, pack._id, { excludedSourceKeys, updatedAt: iso() });
      }
    }
    await store.removeWhere(WATCH_COLLECTIONS.subscriptions, where);
    return { deleted: true, excludedFromAiRefresh: input.manual !== false };
  }

  async function saveWatchIntent(input: WatchInput): Promise<WatchResult> {
    const account = await requireAccount(input);
    const intentText = text(input.text ?? input.intent, 2000);
    if (!intentText) throw new PublicError("请输入求职目标。", "WATCH_INTENT_REQUIRED");
    const existing = await store.findOne(WATCH_COLLECTIONS.intents, { accountId: account.accountId });
    const document = {
      accountId: account.accountId,
      text: intentText,
      structured: {
        jobType: arrayOfText(input.jobType, 10, 30),
        cities: arrayOfText(input.cities, 20, 30),
        keywords: arrayOfText(input.keywords, 30, 50),
        excluded: arrayOfText(input.excluded, 30, 50)
      },
      updatedAt: iso(),
      createdAt: existing?.createdAt ?? iso()
    };
    if (existing) await store.updateById(WATCH_COLLECTIONS.intents, existing._id, document);
    else await store.add(WATCH_COLLECTIONS.intents, { intentId: crypto.randomUUID(), ...document });
    return { intent: publicIntent(document) };
  }

  function encryptionKey(): Buffer {
    if (!deps.cookieMasterKey) throw new PublicError("Cookie 加密密钥尚未配置。", "WATCH_COOKIE_KEY_MISSING", 503);
    return crypto.createHash("sha256").update(deps.cookieMasterKey).digest();
  }

  function encryptJson(value: unknown): Record<string, unknown> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return { v: 1, alg: "A256GCM", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: ciphertext.toString("base64") };
  }

  function decryptJson(value: unknown): unknown {
    const encrypted = asRecord(value);
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(String(encrypted.iv ?? ""), "base64"));
    decipher.setAuthTag(Buffer.from(String(encrypted.tag ?? ""), "base64"));
    return JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(String(encrypted.data ?? ""), "base64")),
      decipher.final()
    ]).toString("utf8")) as unknown;
  }

  function validateCookies(value: unknown, domain: string): Record<string, unknown>[] {
    let parsed = value;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed) as unknown; } catch { throw new PublicError("Cookie 必须是浏览器导出的 JSON 数组。", "INVALID_COOKIES"); }
    }
    if (!Array.isArray(parsed)) throw new PublicError("Cookie 必须是 JSON 数组。", "INVALID_COOKIES");
    return parsed.slice(0, 100).map((raw) => {
      const cookie = asRecord(raw);
      const candidate = String(cookie.domain ?? domain).toLowerCase().replace(/^\./, "");
      if (candidate !== domain && !domain.endsWith(`.${candidate}`) && !candidate.endsWith(`.${domain}`)) {
        throw new PublicError("Cookie 域名与站点不匹配。", "COOKIE_DOMAIN_MISMATCH");
      }
      return {
        name: text(cookie.name, 200), value: text(cookie.value, 5000), domain: candidate,
        path: text(cookie.path || "/", 500), expires: Number(cookie.expires ?? cookie.expirationDate ?? 0) || 0,
        httpOnly: Boolean(cookie.httpOnly), secure: cookie.secure !== false, sameSite: text(cookie.sameSite, 20)
      };
    }).filter((cookie) => cookie.name && cookie.value);
  }

  async function saveSiteSession(input: WatchInput): Promise<WatchResult> {
    const account = await requireAccount(input);
    const domain = normalizeDomain(input.domain);
    const cookies = validateCookies(input.cookies, domain);
    if (!cookies.length) throw new PublicError("Cookie 列表为空或格式不正确。", "INVALID_COOKIES");
    const expiries = cookies.map((cookie) => Number(cookie.expires ?? 0)).filter((value) => value > Date.now() / 1000).sort((a, b) => a - b);
    const existing = await store.findOne(WATCH_COLLECTIONS.sessions, { accountId: account.accountId, domain });
    const document = {
      accountId: account.accountId,
      domain,
      label: text(input.label, 80) || domain,
      cookieCount: cookies.length,
      encrypted: encryptJson(cookies),
      expiresAt: expiries.length ? new Date(expiries[0]! * 1000).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString(),
      status: "active",
      updatedAt: iso(),
      createdAt: existing?.createdAt ?? iso()
    };
    let saved: Record<string, unknown>;
    if (existing) {
      await store.updateById(WATCH_COLLECTIONS.sessions, existing._id, document);
      saved = { ...existing, ...document };
    } else {
      saved = await store.add(WATCH_COLLECTIONS.sessions, { sessionId: crypto.randomUUID(), ...document });
    }
    return { session: publicSession(saved) };
  }

  async function generateRecruitmentSources(input: WatchInput): Promise<WatchResult> {
    const account = await requireAccount(input);
    const cities = arrayOfText(input.cities, 20, 30);
    const roles = arrayOfText(input.roles ?? input.keywords, 30, 60);
    const description = text(input.text ?? `目标城市：${cities.join("、")}；岗位：${roles.join("、")}`, 2000);
    await saveWatchIntent({ accountToken: input.accountToken ?? input.token, text: description, cities, keywords: roles, jobType: input.jobType });
    const requestedPackageId = text(input.packageId, 80);
    let pack = requestedPackageId
      ? await store.findOne(WATCH_COLLECTIONS.packages, { accountId: account.accountId, packageId: requestedPackageId })
      : null;
    if (requestedPackageId && !pack) throw new PublicError("招聘信息源卡片不存在。", "WATCH_PACKAGE_NOT_FOUND");
    if (!pack) {
      const now = iso();
      pack = await store.add(WATCH_COLLECTIONS.packages, {
        packageId: crypto.randomUUID(), accountId: account.accountId,
        name: text(input.name, 80) || `${cities.join("/") || "全国"} · ${roles.slice(0, 2).join("/") || "招聘信息"}`,
        systemType: "discovery-card", template: "招聘咨询", description,
        consultation: { cities, roles, jobType: arrayOfText(input.jobType, 5, 30) },
        intervalMinutes: 30, status: "active", excludedSourceKeys: [], createdAt: now, updatedAt: now
      });
    } else {
      await store.updateById(WATCH_COLLECTIONS.packages, pack._id, {
        description, consultation: { cities, roles, jobType: arrayOfText(input.jobType, 5, 30) }, updatedAt: iso()
      });
    }
    const excluded = new Set(Array.isArray(pack.excludedSourceKeys) ? pack.excludedSourceKeys.map(String) : []);
    const sources: Record<string, unknown>[] = [];
    for (const item of recruitmentCatalog(cities, roles)) {
      if (excluded.has(sha256(normalizeUrl(item.url)))) continue;
      sources.push(await addSourceFor(account, { ...item, packageId: pack.packageId, purpose: "discovery", fetchMode: "http" }));
    }
    return { package: stripInternal(pack), sources, generatedAt: iso(), strategy: "append_only", policy: "ai_sources_only_add", excludedCount: excluded.size };
  }

  async function createApplication(input: WatchInput): Promise<WatchResult> {
    const account = await requireAccount(input);
    const url = normalizeUrl(input.url);
    const now = iso();
    const application = await store.add(WATCH_COLLECTIONS.applications, {
      applicationId: crypto.randomUUID(), accountId: account.accountId,
      company: text(input.company, 120) || new URL(url).hostname,
      role: text(input.role ?? input.title, 160) || "待识别岗位",
      url, city: text(input.city, 60), stage: normalizeStage(input.stage ?? "applied"),
      stageLabel: stageLabel(input.stage ?? "applied"), status: "tracking",
      appliedAt: text(input.appliedAt, 40) || now, lastProgressAt: now,
      nextCheckAt: now, createdAt: now, updatedAt: now
    });
    const pack = await ensureSystemPackage(account, "已投递岗位", "application");
    const source = await addSourceFor(account, {
      url, title: `${application.company} · ${application.role}`, packageId: pack.packageId,
      purpose: "application", applicationId: application.applicationId,
      fetchMode: input.requiresLogin === false ? "http" : "session", intervalMinutes: Number(input.intervalMinutes ?? 360)
    });
    await store.updateById(WATCH_COLLECTIONS.applications, application._id, { sourceId: source.sourceId });
    await addApplicationEvent(account.accountId, String(application.applicationId), String(application.stage), "用户添加投递记录", now);
    return { application: stripInternal({ ...application, sourceId: source.sourceId }), source };
  }

  async function updateApplicationStage(input: WatchInput): Promise<WatchResult> {
    const account = await requireAccount(input);
    const applicationId = text(input.applicationId, 80);
    const application = await store.findOne(WATCH_COLLECTIONS.applications, { accountId: account.accountId, applicationId });
    if (!application) throw new PublicError("投递记录不存在。", "WATCH_APPLICATION_NOT_FOUND");
    const stage = normalizeStage(input.stage);
    const now = iso();
    await store.updateById(WATCH_COLLECTIONS.applications, application._id, { stage, stageLabel: stageLabel(stage), lastProgressAt: now, updatedAt: now });
    await addApplicationEvent(account.accountId, applicationId, stage, text(input.note, 500) || "用户更新进度", now);
    return { updated: true, stage, stageLabel: stageLabel(stage) };
  }

  async function claimDueSources(input: WatchInput): Promise<WatchResult> {
    requireWorker(input);
    const now = new Date();
    const sources = await store.list(WATCH_COLLECTIONS.sources, {}, 1000);
    const due = sources.filter((source) =>
      source.status !== "disabled" &&
      (!source.nextRunAt || new Date(String(source.nextRunAt)) <= now) &&
      (!source.leaseUntil || new Date(String(source.leaseUntil)) <= now)
    ).slice(0, clamp(Number(input.limit ?? 10), 1, 30));
    const leaseUntil = new Date(Date.now() + 10 * 60000).toISOString();
    for (const source of due) await store.updateById(WATCH_COLLECTIONS.sources, source._id, { leaseUntil, status: "running", updatedAt: iso() });
    return { sources: due.map((source) => ({
      sourceId: source.sourceId, url: source.url, hostname: source.hostname, fetchMode: source.fetchMode,
      purpose: source.purpose ?? "discovery", applicationId: source.applicationId ?? "",
      etag: source.etag ?? "", lastModified: source.lastModified ?? "", leaseUntil
    })) };
  }

  async function getWorkerSession(input: WatchInput): Promise<WatchResult> {
    requireWorker(input);
    const source = await store.findOne(WATCH_COLLECTIONS.sources, { sourceId: text(input.sourceId, 80) });
    if (!source || source.fetchMode !== "session") return { cookies: [] };
    const accountIds = source.ownerAccountId ? [String(source.ownerAccountId)] : [];
    if (!accountIds.length) {
      const subscriptions = await store.list(WATCH_COLLECTIONS.subscriptions, { sourceId: source.sourceId }, 50);
      accountIds.push(...subscriptions.map((item) => String(item.accountId ?? "")).filter(Boolean));
    }
    for (const accountId of accountIds) {
      const session = await store.findOne(WATCH_COLLECTIONS.sessions, { accountId, domain: source.hostname, status: "active" });
      if (session && new Date(String(session.expiresAt)) > new Date()) return { cookies: decryptJson(session.encrypted) as unknown[] };
    }
    return { cookies: [] };
  }

  async function upsertJob(source: WatchDocument, raw: Record<string, unknown>, now: string): Promise<void> {
    const title = text(raw.title, 200);
    const url = safeChildUrl(raw.url, source.url);
    if (!title || !url) return;
    const fingerprint = sha256(`${source.sourceId}|${url}|${title.toLowerCase()}`);
    const existing = await store.findOne(WATCH_COLLECTIONS.jobs, { fingerprint });
    const document = {
      fingerprint, sourceId: source.sourceId, title, url,
      company: text(raw.company, 120) || source.title,
      city: text(raw.city, 80), salary: text(raw.salary, 80),
      jobType: text(raw.jobType, 30) || "unknown", deadline: text(raw.deadline, 40),
      summary: text(raw.summary, 1000), status: "active", lastSeenAt: now, updatedAt: now
    };
    if (existing) await store.updateById(WATCH_COLLECTIONS.jobs, existing._id, document);
    else await store.add(WATCH_COLLECTIONS.jobs, { jobId: crypto.randomUUID(), firstSeenAt: now, createdAt: now, ...document });
  }

  async function submitFetchResult(input: WatchInput): Promise<WatchResult> {
    requireWorker(input);
    const source = await store.findOne(WATCH_COLLECTIONS.sources, { sourceId: text(input.sourceId, 80) });
    if (!source) throw new PublicError("来源不存在。", "WATCH_SOURCE_NOT_FOUND");
    const now = iso();
    const contentHash = text(input.contentHash, 128);
    const changed = Boolean(contentHash && contentHash !== source.contentHash);
    const statusCode = Number(input.statusCode ?? 0);
    const ok = statusCode >= 200 && statusCode < 400;
    const interval = clamp(Number(source.intervalMinutes ?? 30), 30, 1440);
    const patch: Record<string, unknown> = {
      status: ok ? "active" : "error", lastCheckedAt: now, leaseUntil: null,
      nextRunAt: new Date(Date.now() + interval * 60000).toISOString(), updatedAt: now,
      lastError: ok ? "" : text(input.error ?? `HTTP ${statusCode}`, 500),
      etag: text(input.etag, 300), lastModified: text(input.lastModified, 300)
    };
    if (changed) Object.assign(patch, { contentHash, lastChangedAt: now });
    await store.updateById(WATCH_COLLECTIONS.sources, source._id, patch);
    if (ok && source.fetchMode === "session" && source.ownerAccountId) {
      const session = await store.findOne(WATCH_COLLECTIONS.sessions, { accountId: source.ownerAccountId, domain: source.hostname, status: "active" });
      if (session) await store.updateById(WATCH_COLLECTIONS.sessions, session._id, { health: "healthy", lastValidatedAt: now, updatedAt: now });
    }
    if (ok && source.purpose === "application" && source.applicationId && input.applicationStage) {
      const application = await store.findOne(WATCH_COLLECTIONS.applications, { applicationId: source.applicationId, accountId: source.ownerAccountId });
      const stage = normalizeStage(input.applicationStage);
      if (application && stage !== application.stage) {
        await store.updateById(WATCH_COLLECTIONS.applications, application._id, { stage, stageLabel: stageLabel(stage), lastProgressAt: now, updatedAt: now });
        await addApplicationEvent(String(source.ownerAccountId ?? ""), String(source.applicationId), stage, text(input.applicationMessage, 500) || "系统从投递页面识别到进度变化", now);
      }
    }
    if (ok && changed) {
      await store.add(WATCH_COLLECTIONS.snapshots, {
        snapshotId: crypto.randomUUID(), sourceId: source.sourceId, contentHash,
        title: text(input.title, 200), textExcerpt: text(input.textExcerpt, 12000), fetchedAt: now
      });
      await store.add(WATCH_COLLECTIONS.changes, {
        changeId: crypto.randomUUID(), sourceId: source.sourceId,
        previousHash: source.contentHash ?? "", contentHash, createdAt: now
      });
      for (const raw of asRecords(input.jobs).slice(0, 100)) await upsertJob(source, raw, now);
    }
    return { accepted: true, changed };
  }

  async function releaseSourceLease(input: WatchInput): Promise<WatchResult> {
    requireWorker(input);
    const source = await store.findOne(WATCH_COLLECTIONS.sources, { sourceId: text(input.sourceId, 80) });
    if (source) await store.updateById(WATCH_COLLECTIONS.sources, source._id, {
      leaseUntil: null, status: "error", lastError: text(input.error, 500),
      nextRunAt: new Date(Date.now() + 10 * 60000).toISOString(), updatedAt: iso()
    });
    return { released: true };
  }

  return new Map<string, WatchAction>([
    ["getWatchBootstrap", getWatchBootstrap],
    ["listWatchPackages", async (input) => { const account = await requireAccount(input); return { packages: await owned(WATCH_COLLECTIONS.packages, account.accountId, 100) }; }],
    ["createWatchPackage", createWatchPackage],
    ["deleteWatchPackage", deleteWatchPackage],
    ["listWatchSources", async (input) => { const account = await requireAccount(input); return { sources: await listWatchSourcesFor(account.accountId) }; }],
    ["addWatchSource", async (input) => { const account = await requireAccount(input); return { source: await addSourceFor(account, input) }; }],
    ["deleteWatchSource", deleteWatchSource],
    ["saveWatchIntent", saveWatchIntent],
    ["saveSiteSession", saveSiteSession],
    ["listSiteSessions", async (input) => { const account = await requireAccount(input); return { sessions: (await owned(WATCH_COLLECTIONS.sessions, account.accountId, 100)).map(publicSession) }; }],
    ["deleteSiteSession", async (input) => {
      const account = await requireAccount(input);
      const session = await store.findOne(WATCH_COLLECTIONS.sessions, { accountId: account.accountId, sessionId: text(input.sessionId, 80) });
      if (!session) throw new PublicError("登录会话不存在。", "WATCH_SESSION_NOT_FOUND");
      await store.removeById(WATCH_COLLECTIONS.sessions, session._id);
      return { deleted: true };
    }],
    ["generateRecruitmentSources", generateRecruitmentSources],
    ["createApplication", createApplication],
    ["updateApplicationStage", updateApplicationStage],
    ["createGenericMonitor", async (input) => {
      const account = await requireAccount(input);
      const pack = await ensureSystemPackage(account, "通用网页监控", "generic");
      return { source: await addSourceFor(account, { ...input, packageId: pack.packageId, purpose: "generic", fetchMode: input.fetchMode ?? "http", intervalMinutes: Number(input.intervalMinutes ?? 60) }) };
    }],
    ["setupWatchDatabase", async (input) => { requireWorker(input); return { collections: Object.values(WATCH_COLLECTIONS), ready: true }; }],
    ["claimDueSources", claimDueSources],
    ["getWorkerSession", getWorkerSession],
    ["submitFetchResult", submitFetchResult],
    ["releaseSourceLease", releaseSourceLease]
  ]);
}

function recruitmentCatalog(cities: string[], roles: string[]): Record<string, unknown>[] {
  const focus = [...cities, ...roles].join("、");
  return [
    { title: "国家大学生就业服务平台", url: "https://www.ncss.cn/", core: true, description: `国家级就业信息入口 · ${focus}` },
    { title: "腾讯招聘", url: "https://join.qq.com/", core: true, description: `企业官方招聘 · ${focus}` },
    { title: "百度招聘", url: "https://talent.baidu.com/", core: true, description: `企业官方招聘 · ${focus}` },
    { title: "字节跳动校园招聘", url: "https://jobs.bytedance.com/campus/", core: true, description: `校园招聘入口 · ${focus}` },
    { title: "招商银行招聘", url: "https://career.cmbchina.com/", core: false, description: `金融科技岗位 · ${focus}` }
  ];
}

export const watchInternals = { normalizeUrl, normalizeDomain, normalizeStage, stageLabel };
