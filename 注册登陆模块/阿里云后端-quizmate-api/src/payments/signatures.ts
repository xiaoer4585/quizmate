import crypto from "node:crypto";

export type PaymentParams = Record<string, unknown>;

function populatedEntries(params: PaymentParams, excluded: ReadonlySet<string>): [string, string][] {
  return Object.keys(params)
    .filter((name) => !excluded.has(name))
    .filter((name) => params[name] !== undefined && params[name] !== null && String(params[name]) !== "")
    .sort()
    .map((name) => [name, String(params[name])]);
}

export function buildAlipaySignContent(params: PaymentParams): string {
  return populatedEntries(params, new Set(["sign", "action"]))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
}

export function buildPayjsSignContent(params: PaymentParams, key: string): string {
  const content = populatedEntries(params, new Set(["sign"]))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  return `${content}&key=${key}`;
}

export function buildEpaySignContent(params: PaymentParams, key: string): string {
  const content = populatedEntries(params, new Set(["sign", "sign_type", "action"]))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  return `${content}${key}`;
}

export function signPayjsParams(params: PaymentParams, key: string): string {
  return crypto.createHash("md5").update(buildPayjsSignContent(params, key), "utf8").digest("hex").toUpperCase();
}

export function verifyPayjsParams(params: PaymentParams, key: string): boolean {
  const sign = String(params.sign ?? "");
  if (!sign) return false;
  const expected = signPayjsParams(params, key);
  return sign.length === expected.length && crypto.timingSafeEqual(Buffer.from(sign.toUpperCase()), Buffer.from(expected));
}

export function signEpayParams(params: PaymentParams, key: string): string {
  return crypto.createHash("md5").update(buildEpaySignContent(params, key), "utf8").digest("hex");
}

export function verifyEpayParams(params: PaymentParams, key: string): boolean {
  const sign = String(params.sign ?? "").toLowerCase();
  if (!sign) return false;
  const expected = signEpayParams(params, key).toLowerCase();
  return sign.length === expected.length && crypto.timingSafeEqual(Buffer.from(sign), Buffer.from(expected));
}

function formatPublicKey(value: string): string {
  const normalized = value.replace(/\\n/g, "\n").trim();
  if (normalized.includes("BEGIN PUBLIC KEY")) return normalized;
  return `-----BEGIN PUBLIC KEY-----\n${normalized.match(/.{1,64}/g)?.join("\n") ?? normalized}\n-----END PUBLIC KEY-----`;
}

function formatPrivateKey(value: string): string {
  const normalized = value.replace(/\\n/g, "\n").trim();
  if (normalized.includes("BEGIN PRIVATE KEY") || normalized.includes("BEGIN RSA PRIVATE KEY")) return normalized;
  return `-----BEGIN PRIVATE KEY-----\n${normalized.match(/.{1,64}/g)?.join("\n") ?? normalized}\n-----END PRIVATE KEY-----`;
}

export function signAlipayParams(params: PaymentParams, privateKey: string): string {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(buildAlipaySignContent(params), "utf8");
  signer.end();
  return signer.sign(formatPrivateKey(privateKey), "base64");
}

export function verifyAlipayParams(params: PaymentParams, publicKey: string): boolean {
  const sign = String(params.sign ?? "");
  if (!sign || !publicKey) return false;
  try {
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(buildAlipaySignContent(params), "utf8");
    verifier.end();
    return verifier.verify(formatPublicKey(publicKey), sign, "base64");
  } catch {
    return false;
  }
}

export function paymentPayloadDigest(params: PaymentParams): string {
  const canonical = populatedEntries(params, new Set(["sign"]))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}
