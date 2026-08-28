const API = "https://api.quizmate.vip/study-auth-api";

async function post(body) {
  const started = Date.now();
  try {
    const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let json = null;
    try { json = await res.json(); } catch {}
    return { http: res.status, ms: Date.now() - started, ok: json?.ok, code: json?.code, error: json?.error };
  } catch (e) {
    return { http: 0, ms: Date.now() - started, error: String(e.message || e) };
  }
}

(async () => {
  // 1. 未知动作 -> 应返回 UNKNOWN_ACTION 400
  console.log("unknown-action:", JSON.stringify(await post({ action: "__nope__" })));
  // 2. 公开配置接口
  console.log("getCreditConfig:", JSON.stringify(await post({ action: "getCreditConfig" })));
  // 3. 管理接口不带凭据 -> ADMIN_AUTH_FAILED/AUTH_REQUIRED
  for (const action of ["adminListCreditAccounts", "adminListCreditLogs", "adminDashboardSummary", "adminDownloadStats", "adminGetCreditWhitelist"]) {
    console.log(action + " (no-auth):", JSON.stringify(await post({ action, page: 1, pageSize: 5 })));
  }
  // 4. 健康端点
  try {
    const res = await fetch("https://api.quizmate.vip/health");
    console.log("health:", res.status, (await res.text()).slice(0, 120));
  } catch (e) { console.log("health: FAIL " + e.message); }
})();
