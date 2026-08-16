// 更新聚合支付（epay）配置为 niman.cn 平台
// 用法：在阿里云后端服务器上执行 pnpm tsx scripts/update-epay-config.ts
// 需要环境变量：DATABASE_URL、CONFIG_ENCRYPTION_KEY
//
// 如需自定义参数，可通过环境变量覆盖：
//   EPAY_API_URL  EPAY_PID  EPAY_KEY  EPAY_NOTIFY_URL  EPAY_RETURN_URL
import { loadConfig } from "../src/config.js";
import { createPool } from "../src/db.js";
import { RuntimeSettingsStore } from "../src/services/runtime-settings.js";

const config = loadConfig();

if (!config.CONFIG_ENCRYPTION_KEY) {
  throw new Error("CONFIG_ENCRYPTION_KEY 未配置，无法写入加密字段（epayKey）。");
}

// 新平台配置（niman.cn），可通过环境变量覆盖
const newEpayConfig = {
  epayEnabled: true,
  epayApiUrl: process.env.EPAY_API_URL ?? "https://api.niman.cn/",
  epayPid: process.env.EPAY_PID ?? "1662",
  epayKey: process.env.EPAY_KEY ?? "TGcgBLcJpCYCLbHAacGgGgJfPGghJgC1",
  epayNotifyUrl: process.env.EPAY_NOTIFY_URL ?? "https://api.quizmate.vip/payments/epay/notify",
  epayReturnUrl: process.env.EPAY_RETURN_URL ?? "https://www.quizmate.vip/recharge.html"
};

const pool = createPool(config.DATABASE_URL);
const store = new RuntimeSettingsStore(pool, config.CONFIG_ENCRYPTION_KEY);

try {
  const current = await store.get("payment_config");
  console.log("当前 epay 配置：", {
    epayEnabled: current.epayEnabled,
    epayApiUrl: current.epayApiUrl,
    epayPid: current.epayPid,
    epayNotifyUrl: current.epayNotifyUrl,
    epayReturnUrl: current.epayReturnUrl,
    hasEpayKey: Boolean(current.epayKey)
  });

  const merged = { ...current, ...newEpayConfig, updatedAt: new Date().toISOString() };
  await store.set("payment_config", merged, "script");

  console.log("✅ epay 配置已更新为 niman.cn：");
  console.log("   接口地址：", newEpayConfig.epayApiUrl);
  console.log("   商户ID：", newEpayConfig.epayPid);
  console.log("   异步通知：", newEpayConfig.epayNotifyUrl);
  console.log("   同步跳转：", newEpayConfig.epayReturnUrl);
  console.log("   MD5密钥：已写入（加密存储）");
} finally {
  await pool.end();
}
