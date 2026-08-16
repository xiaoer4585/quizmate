// niman.cn V2 接口 RSA 签名/验签模块
// 签名算法：SHA256WithRSA
// 签名步骤：
//   1. 获取所有非空请求参数，剔除 sign、sign_type，按键值 ASCII 升序排序
//   2. 组合为 "参数=参数值" 格式，用 & 连接
//   3. 使用商户私钥计算 RSA 签名（SHA256WithRSA），Base64 编码
// 验签步骤：
//   1. 同签名步骤 1~2 获取待签名字符串
//   2. 使用平台公钥对签名进行 RSA 验签（SHA256WithRSA）
//   3. 校验 timestamp（300 秒内有效）

import crypto from "node:crypto";

export type NimanParams = Record<string, unknown>;

/**
 * 将裸 RSA 密钥字符串包装为 PEM 格式
 * 输入：Base64 编码的裸密钥（无 PEM 头尾）
 * 输出：-----BEGIN PRIVATE KEY----- / -----BEGIN PUBLIC KEY----- 格式
 */
function wrapPrivateKey(key: string): string {
  const cleaned = key.replace(/\s/g, "").replace(/-----[^-]+-----/g, "");
  const lines = cleaned.match(/.{1,64}/g) ?? [cleaned];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

function wrapPublicKey(key: string): string {
  const cleaned = key.replace(/\s/g, "").replace(/-----[^-]+-----/g, "");
  const lines = cleaned.match(/.{1,64}/g) ?? [cleaned];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
}

/**
 * 构建待签名字符串
 * 规则：按键名 ASCII 升序排序，排除 sign/sign_type/空值，格式 k1=v1&k2=v2
 */
export function buildNimanSignContent(params: NimanParams): string {
  const entries = Object.entries(params)
    .filter(([k, v]) => k !== "sign" && k !== "sign_type")
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}

/**
 * 使用商户私钥签名（SHA256WithRSA）
 */
export function signNimanParams(params: NimanParams, merchantPrivateKey: string): string {
  const content = buildNimanSignContent(params);
  const key = wrapPrivateKey(merchantPrivateKey);
  const signer = crypto.createSign("SHA256");
  signer.update(content, "utf8");
  signer.end();
  return signer.sign(key, "base64");
}

/**
 * 使用平台公钥验签（SHA256WithRSA）
 * 同时校验 timestamp（300 秒内有效）
 */
export function verifyNimanParams(params: NimanParams, platformPublicKey: string): boolean {
  const sign = String(params.sign ?? "").trim();
  if (!sign) return false;

  // 校验时间戳（5 分钟内有效）
  const ts = Number(params.timestamp);
  if (ts && Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const content = buildNimanSignContent(params);
  const key = wrapPublicKey(platformPublicKey);
  const verifier = crypto.createVerify("SHA256");
  verifier.update(content, "utf8");
  verifier.end();
  return verifier.verify(key, sign, "base64");
}

/**
 * 构建完整的请求参数（添加 pid、timestamp、sign、sign_type）
 */
export function buildNimanRequest(
  params: NimanParams,
  pid: string,
  merchantPrivateKey: string
): Record<string, string> {
  const request: NimanParams = { ...params, pid, timestamp: String(Math.floor(Date.now() / 1000)) };
  const sign = signNimanParams(request, merchantPrivateKey);
  request.sign = sign;
  request.sign_type = "RSA";
  // 转为 string record
  return Object.fromEntries(Object.entries(request).map(([k, v]) => [k, String(v)]));
}
