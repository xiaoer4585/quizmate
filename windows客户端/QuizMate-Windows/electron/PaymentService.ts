// niman.cn 支付服务 - RSA签名 + 统一下单接口
// 文档: https://api.niman.cn/doc/pay_create.html
import crypto from 'crypto';

const API_BASE = 'https://api.niman.cn';
const PID = 1662;

// 商户私钥 (PKCS#8)
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDUCKL+8fyBga8X
VxfaBC381rrT3rl/4Utdp/4kExD0BfKp7fm+LCYlJIJNtZcmWYk6RxdV2zym1Kcj
HlDeaSIkLqmwJWHfvWTgiWFio/kyOQf1Fz136qfvAXGiBCGrxaNBX3YvrLtgsPBTk
exjhLgHzJ3/CTARdPHnvwPNC/Fq0w2+9+10kFyeX6aO03a/2AUUwy5QvvhMgfhWj
UiDINYPlXogPeQ+GwliqbKOkTHV7JPzxpyGLtr6E/fk6rM+F/obqt536ohtyND6+
6wzTqrXrTT4J8JNWaz0W3T+CgRAiGyOweslpu3s7W/MtyVjQLPokZnUFyU2Yb1ddG
Ta5jhLAgMBAAECggEAWE/Ak672HHqHEpGTvZpADS7iYZxCZqDPYxK1JxFJ3lkb2
OrlOe/pc07hdrxLWA2yujMh5QCLInEvq9DUnc3sCmXlBxiKy0V23o5ZoVvqTqCyT
8J+N5Pkngdb7L8Lxx9p/7Bi6ThoUr1fW29LpaeBfr4akD6jZqHunzdPvfdbdcHvu
9haoUb8KcZ1S02QaeAZNTwp9upT8MpzneFp/iUwUSScLcl9Z+N6FhUOhrzdXMGV
kJYumIqcLKD51Faia35EgDtkswKbWxXG8wZfwo6KDO0kBSU7a1bYxJVPNQQhvtvE
hka0dN+ey1XvjQnOeKLHavvX/8XklQe0Ea/grAVOAQKBgQDtUkS3O798R2b47H/9
tKH+yL+8xwsSCRxrDdoh7yyjJ7Mq77PZO6F+wFNEt4wYRJzsG7kxuWjOER5UHNul
KwQWoe3sxjW9C94aCV9rw4pBEsiW+d5XQTwhjnXf795BuW3NmzUZRuGeLM1Zky8o
aENEPhH3xyhs3Ps1Yo0uuX8eQwKBgQDkuNqd0nX2/c/e/KJxnwOTc7qFxFXcZ7nX
714kyAgryy02tSNMRbFYRlwWi5Vq9Y9oph9ukDazQdIqVY9KraGxq4763NrGTVkj
gPECOoMrYyMux0dP4aCoQIzcr8C0ZOn4XfyDR+xxQsgzTubeC6KACxsQ1bsPIXam
9EN5sgDRWQKBgGomvDnBbdsnDPYWwwE2RKd0H99OoLMGhEGWRpWbJ7oqzcdMxINM
WuYZHKXF+9H3DsHFfMazCh/yJEC3T7/HR+Lft06LMgpHPqcivh2zrymAP1zYkw0w
Trcrw6nQ3vdC+8xVuiB+Rfi8TXXdkeBfEod5xAuyd3CKP4sXc9MMgcGFAoGAT+jp
sHQkdMvOgXjAhHPq+uxXAX9MBDpVKsVdnfopKKvOuytkDrTWtiG28MWJyZnLpeNM
XgOSqORZOiM0cgHh2UI4LRtWcCv79bSJ/55Tz6fOVfyXxKfuynnq/PuGl0AeooCr
xW4uhI+xhIOPk4p7FsNKjIIv3aRyYPg8TttK/9kCgYBvL2nod13FOt7mLqSy6UXT
c9iujFwpn4bJpvSFaatLJU7D4Nswd4nyZxM2JjPOrIsjyRRxeAOtM6LpMJoR6rgR
QeNq1EOJv37qpkFFQIWFGFKgrj9etw4veojCDzbM28XA4e2cGoolQ6wospBvqWMq
Cair7ARY6Q6tb2qo+0SNUw==
-----END PRIVATE KEY-----`;

// 平台公钥 (PKCS#8)
const PLATFORM_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA00D+ATu9SEn98Qtj356T
pvPtG2L/CZ7PS4SC7DKQ5eVHTSsnBzU+SCLe8/WjSBgHAmiNbs1EctuPOFs5lPcC
TETZ1hIEDiWDQo50CV4fNTG0sEPaCt81ods4zkWYKklRJFI3ddp+RbR5DaGjzJMh
KUjt1z0wMdjpc0zCbW/tEEZ8fnaE5XqjnZb7mvXWuAGo0S8IvzcSUdsdTltm/dYpM
iBQu9x27NCyFGXNSMu1cqL/+f7gPkfH3hPjRN1SnH9R8dmtxpAd5fc5r5QeehGTl
Vp4gA6GPpeuqRhq5MvmS1X5e0ZDKMYAhbFNkbly/iHfGfO55nJ14P8U0GYJbpkq2
wIDAQAB
-----END PUBLIC KEY-----`;

export interface CreateOrderResult {
  code: number;
  msg?: string;
  trade_no?: string;
  pay_type?: string;
  pay_info?: string;
  timestamp?: string;
  sign?: string;
  sign_type?: string;
}

/** 生成 RSA 签名 (SHA256WithRSA) */
function rsaSign(data: string): string {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data, 'utf8');
  return signer.sign(PRIVATE_KEY, 'base64');
}

/** 验证平台返回的签名 */
export function verifySign(params: Record<string, string>): boolean {
  const sign = params.sign;
  if (!sign) return false;

  // 1. 获取所有非空参数，剔除 sign、sign_type，按 key ASCII 排序
  const sorted = Object.keys(params)
    .filter(k => k !== 'sign' && k !== 'sign_type' && params[k] !== '' && params[k] !== undefined)
    .sort();

  // 2. 拼接待验签字符串
  const signStr = sorted.map(k => `${k}=${params[k]}`).join('&');

  // 3. 用平台公钥验签
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signStr, 'utf8');
  return verifier.verify(PLATFORM_PUBLIC_KEY, sign, 'base64');
}

/** 构建签名串并签名 */
function buildSignedParams(params: Record<string, string>): Record<string, string> {
  // 1. 获取所有非空参数，剔除 sign、sign_type，按 key ASCII 排序
  const sorted = Object.keys(params)
    .filter(k => k !== 'sign' && k !== 'sign_type' && params[k] !== '' && params[k] !== undefined)
    .sort();

  // 2. 拼接待签名字符串
  const signStr = sorted.map(k => `${k}=${params[k]}`).join('&');

  // 3. RSA 签名
  const sign = rsaSign(signStr);

  return { ...params, sign, sign_type: 'RSA' };
}

/** 统一下单接口 - 返回支付二维码链接 */
export async function createPayOrder(opts: {
  type: 'alipay' | 'wxpay';
  outTradeNo: string;
  name: string;
  money: string;
  notifyUrl: string;
  returnUrl: string;
  clientip: string;
}): Promise<CreateOrderResult> {
  const params: Record<string, string> = {
    pid: String(PID),
    method: 'web',
    device: 'pc',
    type: opts.type,
    out_trade_no: opts.outTradeNo,
    notify_url: opts.notifyUrl,
    return_url: opts.returnUrl,
    name: opts.name,
    money: opts.money,
    clientip: opts.clientip,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };

  const signedParams = buildSignedParams(params);

  // 发送请求 (application/x-www-form-urlencoded)
  const body = new URLSearchParams(signedParams).toString();
  const resp = await fetch(`${API_BASE}/api/pay/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await resp.json()) as CreateOrderResult;
  return data;
}

/** 生成商户订单号 */
export function genOrderNo(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `QM${y}${m}${d}${h}${mi}${s}${rand}`;
}
