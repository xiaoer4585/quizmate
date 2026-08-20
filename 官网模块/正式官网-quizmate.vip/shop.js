// 店铺页面：购买充值卡 -> 支付 -> 获得兑换码
const SHOP_API_ENDPOINT = "https://api.quizmate.vip/study-auth-api";
const SHOP_POLL_INTERVAL_MS = 3000;
const SHOP_POLL_MAX_FAIL = 5;
const SHOP_ORDER_STORAGE_KEY = "quizmate_last_shop_order";

let shopProducts = [];
let shopSelectedProduct = null;
let shopPayMethod = "alipay";
let shopActiveOrder = null;
let shopPollTimer = 0;
let shopCountdownTimer = 0;
let shopQueryFailCount = 0;

injectShopStyles();
initShop().catch((error) => setShopStatus(error.message || String(error), "error"));

async function initShop() {
  await loadShopProducts();
  bindShopEvents();
  window.lucide?.createIcons();
  // 恢复未完成的订单
  const lastOrder = localStorage.getItem(SHOP_ORDER_STORAGE_KEY);
  if (lastOrder) {
    try {
      const order = JSON.parse(lastOrder);
      if (order?.orderNo) queryShopOrder(order.orderNo, { auto: true });
    } catch { /* ignore */ }
  }
}

async function shopApi(action, payload) {
  const response = await fetch(SHOP_API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "请求失败，请稍后再试。");
    error.code = data.code || "REQUEST_FAILED";
    throw error;
  }
  return data.data || {};
}

async function loadShopProducts() {
  const grid = document.querySelector("[data-shop-products]");
  if (!grid) return;
  try {
    const data = await shopApi("listShopProducts", {});
    shopProducts = data.products || [];
    if (!shopProducts.length) {
      grid.innerHTML = "<p>店铺暂未上架商品，请稍后再来。</p>";
      setShopStatus("暂无商品。", "");
      return;
    }
    grid.innerHTML = shopProducts.map((product) => `
      <article class="credit-package-card" data-shop-product-id="${product.productId}">
        <div class="credit-package-summary">
          <div class="credit-package-title">
            <h3>${escapeShopHtml(product.name)}</h3>
            <p>${escapeShopHtml(product.description || `${product.totalCredits} 积分充值卡`)}</p>
          </div>
          <div class="credit-package-meta">
            <span><i data-lucide="coins"></i>${product.totalCredits} 积分</span>
            <span><i data-lucide="ticket-check"></i>兑换码发货</span>
          </div>
        </div>
        <div class="credit-package-price">
          <strong>¥${escapeShopHtml(String(product.price).replace(/\.00$/, ""))}</strong>
        </div>
        <button class="button button-primary" type="button" data-shop-buy="${product.productId}"><i data-lucide="shopping-cart"></i>立即购买</button>
      </article>
    `).join("");
    setShopStatus("");
  } catch (error) {
    grid.innerHTML = "";
    setShopStatus(error.message || "商品加载失败。", "error");
  }
}

function bindShopEvents() {
  // 商品卡片点击购买
  document.querySelectorAll("[data-shop-buy]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const productId = Number(button.dataset.shopBuy);
      openShopBuyModal(productId);
    });
  });

  // 关闭购买弹窗
  document.querySelectorAll("[data-close-shop-buy]").forEach((button) => {
    button.addEventListener("click", closeShopBuyModal);
  });

  // 支付方式选择
  document.querySelectorAll("[data-shop-method]").forEach((button) => {
    button.addEventListener("click", () => {
      shopPayMethod = button.dataset.shopMethod;
      document.querySelectorAll("[data-shop-method]").forEach((item) => {
        item.classList.toggle("active", item.dataset.shopMethod === shopPayMethod);
      });
    });
  });

  // 提交购买
  document.querySelector("[data-shop-buy-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitShopBuy().catch((error) => setShopBuyStatus(error.message || String(error), "error"));
  });

  // 关闭支付弹窗
  document.querySelectorAll("[data-close-shop-pay]").forEach((button) => {
    button.addEventListener("click", closeShopPayModal);
  });

  // 刷新二维码
  document.querySelector("[data-shop-pay-refresh]")?.addEventListener("click", () => {
    refreshShopQr().catch((error) => setShopPayStatus(error.message || String(error), "error"));
  });

  // 复制兑换码
  document.querySelector("[data-shop-copy-code]")?.addEventListener("click", async () => {
    const code = document.querySelector("[data-shop-redemption-code]")?.textContent || "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setShopPayStatus("兑换码已复制。", "success");
    } catch {
      // 兼容旧浏览器
      const input = document.createElement("textarea");
      input.value = code;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setShopPayStatus("兑换码已复制。", "success");
    }
  });

  // 订单查询
  document.querySelector("[data-shop-query-btn]")?.addEventListener("click", () => {
    const orderNo = document.querySelector("[data-shop-query-order-no]")?.value.trim();
    if (!orderNo) return;
    queryShopOrder(orderNo).catch((error) => setShopStatus(error.message || String(error), "error"));
  });
  document.querySelector("[data-shop-query-order-no]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.querySelector("[data-shop-query-btn]")?.click();
    }
  });
}

function openShopBuyModal(productId) {
  const product = shopProducts.find((item) => item.productId === productId);
  if (!product) return;
  shopSelectedProduct = product;
  const nameEl = document.querySelector("[data-shop-buy-name]");
  const creditsEl = document.querySelector("[data-shop-buy-credits]");
  const priceEl = document.querySelector("[data-shop-buy-price]");
  if (nameEl) nameEl.textContent = product.name;
  if (creditsEl) creditsEl.textContent = `共 ${product.totalCredits} 积分（含赠送）`;
  if (priceEl) priceEl.textContent = `¥${String(product.price).replace(/\.00$/, "")}`;
  setShopBuyStatus("");
  const modal = document.querySelector("[data-shop-buy-modal]");
  if (modal) modal.hidden = false;
  window.lucide?.createIcons();
}

function closeShopBuyModal() {
  const modal = document.querySelector("[data-shop-buy-modal]");
  if (modal) modal.hidden = true;
}

async function submitShopBuy() {
  if (!shopSelectedProduct) throw new Error("请选择商品。");
  const form = document.querySelector("[data-shop-buy-form]");
  const email = form?.querySelector("[name='email']")?.value.trim() || "";
  const name = form?.querySelector("[name='name']")?.value.trim() || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("请输入有效的邮箱地址。");

  const submitBtn = document.querySelector("[data-shop-buy-submit]");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "正在创建订单..."; }
  try {
    const order = await shopApi("createShopOrder", {
      productId: shopSelectedProduct.productId,
      buyerEmail: email,
      buyerName: name,
      method: shopPayMethod
    });
    shopActiveOrder = order;
    localStorage.setItem(SHOP_ORDER_STORAGE_KEY, JSON.stringify({ orderNo: order.orderNo, email }));
    closeShopBuyModal();
    showShopPayModal(order);
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `<i data-lucide="credit-card"></i>去支付`; }
    window.lucide?.createIcons();
  }
}

function showShopPayModal(order) {
  const modal = document.querySelector("[data-shop-pay-modal]");
  if (!modal) return;
  const body = document.querySelector("[data-shop-pay-body]");
  const success = document.querySelector("[data-shop-pay-success]");
  if (body) body.hidden = false;
  if (success) success.hidden = true;
  const qrEl = document.querySelector("[data-shop-pay-qr]");
  if (qrEl && order.qrDataUrl) qrEl.innerHTML = `<img src="${order.qrDataUrl}" alt="支付二维码" />`;
  const orderNoEl = document.querySelector("[data-shop-pay-order-no]");
  const nameEl = document.querySelector("[data-shop-pay-name]");
  const priceEl = document.querySelector("[data-shop-pay-price]");
  if (orderNoEl) orderNoEl.textContent = order.orderNo || "-";
  if (nameEl) nameEl.textContent = order.productName || "-";
  if (priceEl) priceEl.textContent = `¥${String(order.price || "").replace(/\.00$/, "")}`;
  setShopPayStatus(order.method === "wechat" ? "请使用微信扫码支付" : "请使用支付宝扫码支付");
  modal.hidden = false;
  startShopCountdown(order.expiresAt);
  startShopPolling();
  window.lucide?.createIcons();
}

function closeShopPayModal() {
  stopShopPolling();
  stopShopCountdown();
  const modal = document.querySelector("[data-shop-pay-modal]");
  if (modal) modal.hidden = true;
}

function startShopPolling() {
  stopShopPolling();
  shopQueryFailCount = 0;
  shopPollTimer = setInterval(async () => {
    if (!shopActiveOrder?.orderNo) return;
    try {
      const data = await shopApi("queryShopOrder", { orderNo: shopActiveOrder.orderNo });
      shopQueryFailCount = 0;
      handleShopOrderUpdate(data);
    } catch (error) {
      shopQueryFailCount += 1;
      if (shopQueryFailCount >= SHOP_POLL_MAX_FAIL) {
        stopShopPolling();
        setShopPayStatus(`查询失败：${error.message || String(error)}，请稍后手动查询订单。`, "error");
      }
    }
  }, SHOP_POLL_INTERVAL_MS);
}

function stopShopPolling() {
  if (shopPollTimer) { clearInterval(shopPollTimer); shopPollTimer = 0; }
}

function startShopCountdown(expiresAt) {
  stopShopCountdown();
  const el = document.querySelector("[data-shop-pay-countdown]");
  if (!el || !expiresAt) return;
  const deadline = new Date(expiresAt).getTime();
  shopCountdownTimer = setInterval(() => {
    const remain = deadline - Date.now();
    if (remain <= 0) {
      el.textContent = "00:00";
      stopShopCountdown();
      return;
    }
    const minutes = Math.floor(remain / 60000);
    const seconds = Math.floor((remain % 60000) / 1000);
    el.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, 1000);
}

function stopShopCountdown() {
  if (shopCountdownTimer) { clearInterval(shopCountdownTimer); shopCountdownTimer = 0; }
}

function handleShopOrderUpdate(data) {
  const order = data?.order;
  if (!order) return;
  // 支付成功（fulfilled = 已发兑换码）
  if (order.status === "fulfilled" && order.redemptionCode) {
    stopShopPolling();
    stopShopCountdown();
    const body = document.querySelector("[data-shop-pay-body]");
    const success = document.querySelector("[data-shop-pay-success]");
    const codeEl = document.querySelector("[data-shop-redemption-code]");
    if (body) body.hidden = true;
    if (success) success.hidden = false;
    if (codeEl) codeEl.textContent = order.redemptionCode;
    localStorage.removeItem(SHOP_ORDER_STORAGE_KEY);
    window.lucide?.createIcons();
    return;
  }
  if (order.status === "expired") {
    stopShopPolling();
    stopShopCountdown();
    const refreshBtn = document.querySelector("[data-shop-pay-refresh]");
    if (refreshBtn) refreshBtn.hidden = false;
    setShopPayStatus("二维码已过期，请刷新二维码或重新下单。", "error");
    return;
  }
  if (order.qrDataUrl) {
    const qrEl = document.querySelector("[data-shop-pay-qr]");
    if (qrEl) qrEl.innerHTML = `<img src="${order.qrDataUrl}" alt="支付二维码" />`;
  }
  setShopPayStatus(data?.message || "订单等待支付...");
}

async function queryShopOrder(orderNo, options = {}) {
  const data = await shopApi("queryShopOrder", { orderNo });
  const order = data?.order;
  if (!order) return;
  shopActiveOrder = { orderNo: order.orderNo, price: order.price, productName: order.productName, method: order.method };
  localStorage.setItem(SHOP_ORDER_STORAGE_KEY, JSON.stringify({ orderNo: order.orderNo }));
  if (order.status === "fulfilled" && order.redemptionCode) {
    showShopPayModal({ ...order, qrDataUrl: "" });
    handleShopOrderUpdate(data);
    return;
  }
  if (order.status === "expired" || options.auto) {
    showShopPayModal({ ...order, qrDataUrl: "" });
    handleShopOrderUpdate(data);
    return;
  }
  setShopStatus(data?.message || `订单状态：${order.status}`, "");
}

async function refreshShopQr() {
  if (!shopActiveOrder?.orderNo) throw new Error("订单不存在。");
  setShopPayStatus("正在刷新二维码...");
  const order = await shopApi("refreshShopQrCode", { orderNo: shopActiveOrder.orderNo });
  shopActiveOrder = { ...shopActiveOrder, ...order };
  const qrEl = document.querySelector("[data-shop-pay-qr]");
  if (qrEl && order.qrDataUrl) qrEl.innerHTML = `<img src="${order.qrDataUrl}" alt="支付二维码" />`;
  const refreshBtn = document.querySelector("[data-shop-pay-refresh]");
  if (refreshBtn) refreshBtn.hidden = true;
  startShopCountdown(order.expiresAt);
  startShopPolling();
  setShopPayStatus(order.method === "wechat" ? "已刷新，请使用微信扫码支付" : "已刷新，请使用支付宝扫码支付");
}

function setShopStatus(text, type = "") {
  const el = document.querySelector("[data-shop-status]");
  if (!el) return;
  el.textContent = text || "";
  el.className = `credit-status ${type}`.trim();
}

function setShopBuyStatus(text, type = "") {
  const el = document.querySelector("[data-shop-buy-status]");
  if (!el) return;
  el.textContent = text || "";
  el.className = `credit-status ${type}`.trim();
}

function setShopPayStatus(text, type = "") {
  const el = document.querySelector("[data-shop-pay-status]");
  if (!el) return;
  el.textContent = text || "";
  el.className = `credit-status ${type}`.trim();
}

function injectShopStyles() {
  if (document.getElementById("qm-shop-styles")) return;
  const style = document.createElement("style");
  style.id = "qm-shop-styles";
  style.textContent = `
    .shop-order-query {
      margin-top: 24px; padding: 18px 20px; border: 1.5px dashed #c3d2e8;
      border-radius: 14px; background: #f7fafc;
      display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    }
    .shop-order-query-form { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .shop-order-query-form input {
      width: 260px; border: 1.5px solid #d8e1ec; border-radius: 10px;
      padding: 10px 14px; font-size: 14px;
      font-family: ui-monospace, "SF Mono", Consolas, monospace;
    }
    .shop-order-query-form input:focus { outline: none; border-color: #2563eb; }
    .redeem-entry-copy { display: grid; gap: 4px; }
    .redeem-entry-copy strong { font-size: 15px; display: flex; align-items: center; gap: 8px; }
    .redeem-entry-copy strong svg { width: 18px; height: 18px; color: #2563eb; }
    .redeem-entry-copy span { font-size: 13px; color: #667085; }
    .redeem-dialog { max-width: 460px; }
    .redeem-form { display: grid; gap: 12px; margin-top: 12px; }
    .redeem-form label { display: grid; gap: 6px; font-size: 14px; color: #344054; font-weight: 600; }
    .redeem-form input {
      width: 100%; border: 1.5px solid #d8e1ec; border-radius: 10px;
      padding: 12px 14px; font-size: 15px; transition: border-color .15s ease;
    }
    .redeem-form input:focus { outline: none; border-color: #2563eb; }
    .shop-buy-summary {
      display: grid; gap: 4px; padding: 14px 16px; border-radius: 12px;
      background: #f7fafc; border: 1px solid #e4ebf4;
    }
    .shop-buy-summary strong { font-size: 16px; }
    .shop-buy-summary span { font-size: 13px; color: #667085; }
    .shop-buy-summary em { font-style: normal; font-size: 20px; font-weight: 800; color: #2563eb; }
    .shop-pay-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .shop-pay-method {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 12px; border: 1.5px solid #d8e1ec; border-radius: 10px;
      background: #fff; cursor: pointer; font-weight: 700; font-size: 14px; color: #344054;
    }
    .shop-pay-method svg { width: 18px; height: 18px; }
    .shop-pay-method.active { border-color: #2563eb; background: #eaf2ff; color: #1e4f9a; }
    .shop-pay-qr { display: grid; place-items: center; padding: 16px; }
    .shop-pay-qr img { width: 240px; height: 240px; border: 1px solid #e4ebf4; border-radius: 12px; }
    .qm-pay-meta { display: grid; gap: 8px; margin: 0; }
    .qm-pay-meta div { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
    .qm-pay-meta dt { color: #667085; }
    .qm-pay-meta dd { margin: 0; font-weight: 600; word-break: break-all; text-align: right; }
    .qm-countdown { font-variant-numeric: tabular-nums; color: #b42318; }
    .shop-pay-success { display: grid; gap: 12px; justify-items: center; text-align: center; padding: 12px 0; }
    .shop-pay-success strong { font-size: 18px; }
    .shop-pay-success p { margin: 0; color: #667085; font-size: 13px; max-width: 340px; }
    .redeem-result-icon {
      width: 56px; height: 56px; border-radius: 50%;
      display: grid; place-items: center; background: #e8f7ef; color: #067647;
    }
    .redeem-result-icon svg { width: 28px; height: 28px; }
    .shop-code-display {
      display: grid; gap: 10px; justify-items: center; width: 100%;
      padding: 16px; border-radius: 12px; background: #f7fafc; border: 1.5px dashed #c3d2e8;
    }
    .shop-code-display code {
      font-size: 20px; font-weight: 800; letter-spacing: 2px; color: #1e4f9a;
      font-family: ui-monospace, "SF Mono", Consolas, monospace; word-break: break-all;
    }
    .credit-modal-backdrop { position: absolute; inset: 0; }
    .credit-close {
      position: absolute; top: 14px; right: 14px; width: 34px; height: 34px;
      border: 0; border-radius: 50%; background: #f2f5fa; cursor: pointer;
      display: grid; place-items: center; color: #667085; z-index: 2;
    }
    .credit-close svg { width: 18px; height: 18px; }
    .credit-modal {
      position: fixed; inset: 0; z-index: 90; display: grid; place-items: center;
      background: rgba(9, 16, 29, .55); padding: 18px;
    }
    .credit-modal[hidden] { display: none; }
    .credit-dialog {
      position: relative; width: min(460px, 100%); max-height: 90vh; overflow-y: auto;
      background: #fff; border-radius: 18px; padding: 28px; box-shadow: 0 24px 60px rgba(0,0,0,.25);
    }
    .credit-dialog h2 { margin: 6px 0 14px; font-size: 22px; }
    .section-kicker { margin: 0; font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #2563eb; }
    .credit-status { margin: 10px 0 0; font-size: 13px; color: #667085; min-height: 18px; }
    .credit-status.error { color: #b42318; }
    .credit-status.success { color: #067647; }
    .button {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      border: 0; border-radius: 10px; padding: 11px 18px; font-weight: 700;
      font-size: 14px; cursor: pointer; text-decoration: none;
    }
    .button svg { width: 16px; height: 16px; }
    .button-primary { background: #2563eb; color: #fff; }
    .button-primary:hover { filter: brightness(.94); }
    .button-primary:disabled { opacity: .6; cursor: not-allowed; }
    .button-secondary { background: #eaf2ff; color: #1e4f9a; }
    @media (max-width: 640px) {
      .shop-order-query-form input { width: 100%; }
      .shop-order-query-form { width: 100%; }
    }
  `;
  document.head.appendChild(style);
}

function escapeShopHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
