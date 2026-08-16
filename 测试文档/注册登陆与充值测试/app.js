const API_ENDPOINT = "https://api.quizmate.vip/study-auth-api";

const els = {
  balance: document.querySelector("[data-balance]"),
  email: document.querySelector("[data-email]"),
  password: document.querySelector("[data-password]"),
  submitAuth: document.querySelector("[data-submit-auth]"),
  refreshProfile: document.querySelector("[data-refresh-profile]"),
  logout: document.querySelector("[data-logout]"),
  authStatus: document.querySelector("[data-auth-status]"),
  payStatus: document.querySelector("[data-pay-status]"),
  packages: document.querySelector("[data-packages]"),
  orderPanel: document.querySelector("[data-order-panel]"),
  orderTitle: document.querySelector("[data-order-title]"),
  orderInfo: document.querySelector("[data-order-info]"),
  paymentQr: document.querySelector("[data-payment-qr]"),
  payLink: document.querySelector("[data-pay-link]")
};

let authMode = "login";
let token = localStorage.getItem("quizmate_credit_token") || "";
let account = null;
let currentOrder = null;
let pollTimer = 0;

init().catch((error) => setStatus(els.authStatus, error.message, "error"));

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    authMode = button.dataset.authMode;
    document.querySelectorAll("[data-auth-mode]").forEach((item) => item.classList.toggle("active", item === button));
    els.submitAuth.textContent = authMode === "login" ? "登录" : "注册";
  });
});

els.submitAuth.addEventListener("click", () => runAuth());
els.refreshProfile.addEventListener("click", () => loadProfile());
els.logout.addEventListener("click", () => {
  localStorage.removeItem("quizmate_credit_token");
  token = "";
  account = null;
  renderAccount();
  setStatus(els.authStatus, "已退出。");
});

async function init() {
  await loadCreditConfig();
  if (token) {
    await loadProfile().catch(() => {
      localStorage.removeItem("quizmate_credit_token");
      token = "";
      renderAccount();
    });
  } else {
    renderAccount();
  }
}

async function runAuth() {
  const email = els.email.value.trim();
  const password = els.password.value;
  if (!email || !password) {
    setStatus(els.authStatus, "请输入邮箱和密码。", "error");
    return;
  }
  setStatus(els.authStatus, authMode === "login" ? "正在登录..." : "正在注册...");
  const result = await api(authMode === "login" ? "loginAccount" : "registerAccount", { email, password });
  token = result.token || "";
  account = result.account || null;
  localStorage.setItem("quizmate_credit_token", token);
  renderAccount();
  setStatus(els.authStatus, authMode === "login" ? "登录成功。" : "注册成功。", "success");
}

async function loadProfile() {
  if (!token) {
    setStatus(els.authStatus, "请先登录。", "error");
    return;
  }
  const result = await api("getAccountProfile", { accountToken: token });
  account = result.account || null;
  renderAccount();
  setStatus(els.authStatus, "账户已刷新。", "success");
}

async function loadCreditConfig() {
  const config = await api("getCreditConfig", {});
  if (!config.enabled) {
    els.packages.innerHTML = `<div class="status error">聚合易支付暂未配置完成，请先在后台保存接口信息。</div>`;
    return;
  }
  els.packages.innerHTML = (config.packages || []).map((pkg) => `
    <button class="package" type="button" data-package="${escapeHtml(pkg.id)}">
      <span>${escapeHtml(pkg.tag || "积分包")}</span>
      <strong>${escapeHtml(pkg.name)}</strong>
      <em>基础积分：${pkg.baseCredits.toLocaleString("zh-CN")}</em>
      <em>赠送积分：+${pkg.bonusCredits.toLocaleString("zh-CN")}</em>
      <em>总计积分：${pkg.totalCredits.toLocaleString("zh-CN")}</em>
      <b>¥${escapeHtml(pkg.amount)}</b>
    </button>
  `).join("");
  els.packages.querySelectorAll("[data-package]").forEach((button) => {
    button.addEventListener("click", () => createOrder(button.dataset.package));
  });
}

async function createOrder(packageId) {
  if (!token) {
    setStatus(els.payStatus, "请先登录后再充值。", "error");
    return;
  }
  stopPolling();
  setStatus(els.payStatus, "正在创建充值订单...");
  currentOrder = await api("createCreditOrder", { accountToken: token, packageId });
  renderOrder(currentOrder);
  setStatus(els.payStatus, "请用支付宝扫码付款，付款成功后会自动刷新积分。");
  pollTimer = window.setInterval(() => queryOrder().catch((error) => setStatus(els.payStatus, error.message, "error")), 3000);
}

async function queryOrder() {
  if (!currentOrder?.outTradeNo) return;
  const result = await api("queryCreditOrder", { accountToken: token, outTradeNo: currentOrder.outTradeNo });
  currentOrder = result.order || currentOrder;
  account = result.account || account;
  renderAccount();
  renderOrder(currentOrder);
  if (currentOrder.status === "paid") {
    stopPolling();
    setStatus(els.payStatus, "充值成功，积分已到账。", "success");
  }
}

function renderAccount() {
  els.balance.textContent = account ? Number(account.credits || 0).toLocaleString("zh-CN") : "未登录";
}

function renderOrder(order) {
  els.orderPanel.hidden = false;
  els.orderTitle.textContent = order.packageName || "充值订单";
  els.orderInfo.textContent = `订单号：${order.outTradeNo}，金额：¥${order.amount}，积分：${Number(order.totalCredits || 0).toLocaleString("zh-CN")}，状态：${formatStatus(order.status)}`;
  els.paymentQr.src = order.qrDataUrl || "";
  els.payLink.href = order.payUrl || "#";
}

async function api(action, payload) {
  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "请求失败。");
  return data.data || {};
}

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }
}

function formatStatus(status) {
  return { created: "已创建", waiting: "等待付款", paid: "已付款", failed: "失败" }[status] || status || "-";
}

function setStatus(el, text, type = "") {
  el.textContent = text || "";
  el.className = `status ${type}`.trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
