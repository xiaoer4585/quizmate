import type { AppConfig } from "../config.js";

export interface PaymentRuntimeConfig {
  alipay: {
    enabled: boolean;
    appId: string;
    gatewayUrl: string;
    privateKey: string;
    publicKey: string;
    notifyUrl: string;
  };
  payjs: {
    enabled: boolean;
    mchId: string;
    key: string;
    nativeUrl: string;
    queryUrl: string;
    notifyUrl: string;
  };
  epay: {
    enabled: boolean;
    apiUrl: string;
    pid: string;
    key: string;
    merchantPrivateKey: string;
    platformPublicKey: string;
    notifyUrl: string;
    returnUrl: string;
  };
}

export interface PaymentDependencies {
  config: PaymentRuntimeConfig;
  fetch: typeof globalThis.fetch;
}

export function createPaymentDependencies(config: AppConfig): PaymentDependencies {
  return {
    fetch: globalThis.fetch,
    config: {
      alipay: {
        enabled: config.ALIPAY_ENABLED ?? false,
        appId: config.ALIPAY_APP_ID ?? "",
        gatewayUrl: config.ALIPAY_GATEWAY_URL ?? "https://openapi.alipay.com/gateway.do",
        privateKey: config.ALIPAY_PRIVATE_KEY ?? "",
        publicKey: config.ALIPAY_PUBLIC_KEY ?? "",
        notifyUrl: config.ALIPAY_NOTIFY_URL ?? ""
      },
      payjs: {
        enabled: config.PAYJS_ENABLED ?? false,
        mchId: config.PAYJS_MCHID ?? "",
        key: config.PAYJS_KEY ?? "",
        nativeUrl: config.PAYJS_NATIVE_URL ?? "https://payjs.cn/api/native",
        queryUrl: config.PAYJS_QUERY_URL ?? "https://payjs.cn/api/check",
        notifyUrl: config.PAYJS_NOTIFY_URL ?? ""
      },
      epay: {
        enabled: config.EPAY_ENABLED ?? false,
        apiUrl: config.EPAY_API_URL ?? "",
        pid: config.EPAY_PID ?? "",
        key: config.EPAY_KEY ?? "",
        merchantPrivateKey: config.EPAY_MERCHANT_PRIVATE_KEY ?? "",
        platformPublicKey: config.EPAY_PLATFORM_PUBLIC_KEY ?? "",
        notifyUrl: config.EPAY_NOTIFY_URL ?? "",
        returnUrl: config.EPAY_RETURN_URL ?? "https://www.quizmate.vip/recharge.html"
      }
    }
  };
}

export function paymentReadiness(config: PaymentRuntimeConfig) {
  return {
    alipay: config.alipay.enabled
      && Boolean(config.alipay.appId && config.alipay.privateKey && config.alipay.publicKey && config.alipay.notifyUrl),
    wechat: config.payjs.enabled
      && Boolean(config.payjs.mchId && config.payjs.key && config.payjs.nativeUrl && config.payjs.queryUrl && config.payjs.notifyUrl),
    epay: config.epay.enabled
      && Boolean(config.epay.apiUrl && config.epay.pid && config.epay.notifyUrl)
      && Boolean(config.epay.merchantPrivateKey && config.epay.platformPublicKey)
  };
}
