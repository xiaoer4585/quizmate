const CREDIT_API_ENDPOINT = "https://api.quizmate.vip/study-auth-api";
const CREDIT_STORAGE_KEY = "quizmate_credit_account";
const ACTIVE_ORDER_STORAGE_KEY = "quizmate_active_credit_order";
const CODE_COOLDOWN_PREFIX = "quizmate_code_cooldown";
const EARLY_BIRD_DEADLINE = new Date("2026-08-31T23:59:59+08:00").getTime();
// 轮询间隔与失败上限：前端轮询每 3 秒一次，连续 5 次失败转为异常态并停止轮询
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_FAIL = 5;
// 订单展示有效期由后端 expires_at 决定（15 分钟），刷新后续期

const creditEls = {};
let creditConfig = null;
let selectedPackageId = "starter";
let selectedPayMethod = "alipay"; // alipay | wechat
let accountState = loadCreditState();
let activeOrder = loadActiveOrder();
let pollTimer = 0;
let countdownTimer = 0;
let earlyBirdTimer = 0;
let queryFailCount = 0;
let payState = "idle";

injectPayStyles();
ensureCreditModals();
collectCreditElements();
bindCreditEvents();
bindReferralEvents();
initCredits().catch((error) => setCreditStatus(error.message || String(error), "error"));

function collectCreditElements() {
  creditEls.headerAccounts = document.querySelectorAll("[data-header-account]");
  creditEls.accountTitle = document.querySelector("[data-account-title]");
  creditEls.accountSubtitle = document.querySelector("[data-account-subtitle]");
  creditEls.logout = document.querySelector("[data-logout]");
  creditEls.packages = document.querySelector("[data-credit-packages]");
  creditEls.status = document.querySelector("[data-credit-status]");
  creditEls.authModal = document.querySelector("[data-auth-modal]");
  creditEls.authTabs = document.querySelectorAll("[data-auth-tab]");
  creditEls.authForms = document.querySelectorAll("[data-auth-form]");
  creditEls.authStatus = document.querySelector("[data-auth-status]");
  creditEls.payModal = document.querySelector("[data-pay-modal]");
  creditEls.paymentQr = document.querySelector("[data-payment-qr]");
  creditEls.paymentInfo = document.querySelector("[data-payment-info]");
  creditEls.accountMenu = document.querySelector("[data-account-menu]");
  creditEls.menuEmail = document.querySelector("[data-account-menu-email]");
  creditEls.menuCredits = document.querySelector("[data-account-menu-credits]");
  creditEls.menuLogout = document.querySelector("[data-account-menu-logout]");
  // 新增支付弹窗元素（仅在充值页存在）
  creditEls.payAmount = document.querySelector("[data-pay-amount]");
  creditEls.payOrderNo = document.querySelector("[data-pay-order-no]");
  creditEls.payPackage = document.querySelector("[data-pay-package]");
  creditEls.payCredits = document.querySelector("[data-pay-credits]");
  creditEls.payCountdown = document.querySelector("[data-pay-countdown]");
  creditEls.payQrStage = document.querySelector("[data-pay-qr-stage]");
  creditEls.payQrMask = document.querySelector("[data-pay-qr-mask]");
  creditEls.payMaskInner = document.querySelector("[data-pay-mask-inner]");
  creditEls.payLoading = document.querySelector("[data-pay-loading]");
  creditEls.paySuccess = document.querySelector("[data-pay-success]");
  creditEls.payRefresh = document.querySelector("[data-pay-refresh]");
  creditEls.oldUserBonus = document.querySelector("[data-old-user-bonus]");
}

function bindCreditEvents() {
  document.querySelectorAll("[data-open-auth]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handleAccountButtonClick();
    });
  });

  document.querySelectorAll("[data-close-auth]").forEach((button) => {
    button.addEventListener("click", closeAuthModal);
  });

  document.querySelectorAll("[data-close-pay]").forEach((button) => {
    button.addEventListener("click", closePayModal);
  });

  creditEls.logout?.addEventListener("click", () => {
    logoutAccount();
  });

  creditEls.menuLogout?.addEventListener("click", logoutAccount);

  document.addEventListener("click", (event) => {
    if (!creditEls.accountMenu || creditEls.accountMenu.hidden) return;
    if (event.target.closest("[data-account-menu]") || event.target.closest("[data-open-auth]")) return;
    closeAccountMenu();
  });

  creditEls.authTabs.forEach((button) => {
    button.addEventListener("click", () => switchAuthTab(button.dataset.authTab));
  });

  document.querySelector("[data-auth-form='login']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    wrapAuth(async () => {
      const form = event.currentTarget;
      const result = await creditApi("loginAccount", {
        email: form.elements.email.value,
        password: form.elements.password.value
      });
      setLoggedIn(result);
      closeAuthModal();
      setCreditStatus("登录成功，可以选择积分包充值。", "success");
    });
  });

  document.querySelector("[data-auth-form='register']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    wrapAuth(async () => {
      const form = event.currentTarget;
      const email = form.querySelector("[name='email']")?.value.trim() || "";
      const codeInput = form.querySelector("[name='code']");
      const inviteInput = form.querySelector("[name='inviteCode']");
      const password = form.querySelector("[name='password']")?.value || "";
      const code = codeInput?.value.trim() || "";
      const inviteCode = inviteInput?.value.trim().toUpperCase() || "";
      if (!/^\d{6}$/.test(code)) {
        codeInput?.focus();
        throw new Error("请输入邮箱收到的 6 位数字验证码（不是邀请码）。");
      }
      const result = await creditApi("registerAccount", {
        email,
        code,
        password,
        inviteCode
      });
      setLoggedIn(result);
      closeAuthModal();
      setCreditStatus("注册成功，已赠送 50 积分。", "success");
    });
  });

  document.querySelector("[data-auth-form='reset']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    wrapAuth(async () => {
      const form = event.currentTarget;
      await creditApi("resetAccountPassword", {
        email: form.elements.email.value,
        code: form.elements.code.value,
        password: form.elements.password.value
      });
      setAuthStatus("密码已重置，请使用新密码登录。", "success");
      switchAuthTab("login");
    });
  });

  document.querySelectorAll("[data-send-code]").forEach((button) => {
    restoreCodeCountdown(button);
    button.addEventListener("click", () => sendEmailCode(button));
  });

  document.querySelectorAll("[data-auth-form='register'] input").forEach((input) => {
    input.addEventListener("input", () => {
      if (creditEls.authStatus?.classList.contains("error")) setAuthStatus("");
    });
  });

  // 刷新二维码：同一订单重新出码，避免创建重复订单
  creditEls.payRefresh?.addEventListener("click", () => {
    refreshQrCode().catch((error) => showPayError(error.message || String(error), refreshQrCode));
  });

  // 异常态重试按钮
  document.querySelector("[data-pay-retry]")?.addEventListener("click", () => {
    clearPayError();
    if (activeOrder?.outTradeNo) {
      startPolling();
      queryActiveOrder();
    }
  });
}

async function initCredits() {
  updateAccountView();
  startEarlyBirdCountdown();
  if (accountState?.token) await refreshAccountProfile();
  if (!creditEls.packages) {
    window.lucide?.createIcons();
    return;
  }

  // 套餐配置（getCreditConfig）是纯常量接口，几乎不会失败，先加载并渲染，让用户尽快看到套餐
  // 支付配置（getPaymentConfig）需要查库，单独加载并容错：失败时默认允许充值，避免阻塞页面
  const credits = await creditApi("getCreditConfig", {});
  let paymentEnabled = true;
  try {
    const payment = await creditApi("getPaymentConfig", {});
    paymentEnabled = payment.creditEnabled === true;
  } catch {
    // 支付配置查询失败时，默认开启充值（后端 createCreditOrder 会再次校验）
    paymentEnabled = true;
  }
  creditConfig = { ...credits, enabled: paymentEnabled };
  selectedPackageId = creditConfig.packages?.find((item) => item.id === "starter")?.id || creditConfig.packages?.[0]?.id || "";
  renderCreditPackages();
  setCreditStatus(
    creditConfig.enabled ? "请选择积分包，使用支付宝完成充值。" : "在线充值暂未开启。",
    creditConfig.enabled ? "" : "error"
  );
  resumeActiveOrderQuery();
  window.lucide?.createIcons();
}

function renderCreditPackages() {
  const packages = creditConfig?.packages || [];
  if (!creditEls.packages) return;
  if (!packages.length) {
    creditEls.packages.innerHTML = "<p>暂无可购买的积分包。</p>";
    return;
  }

  // 每个套餐包下方独立显示支付宝/微信两个按钮（不再使用顶部统一选择器）
  creditEls.packages.innerHTML = packages.map((pkg) => {
    const selected = pkg.id === selectedPackageId;
    const bonusRate = pkg.baseCredits ? Math.round((pkg.bonusCredits / pkg.baseCredits) * 100) : 0;
    const ratio = (pkg.totalCredits / Number(pkg.amount || 1)).toFixed(1);
    const isRecommended = pkg.id === "starter";
    return `
      <article class="credit-package-card ${selected ? "selected" : ""} ${isRecommended ? "recommended" : ""}" data-package-id="${escapeHtml(pkg.id)}">
        ${pkg.tag ? `<span class="credit-tag">${escapeHtml(pkg.tag)}</span>` : ""}
        <span class="credit-check"><i data-lucide="check"></i></span>
        <div class="credit-package-summary">
          <div class="credit-package-title">
            <h3>${escapeHtml(pkg.name)}</h3>
            <p>${escapeHtml(packageDescription(pkg.id))}</p>
          </div>
          <div class="credit-package-meta">
            <strong>${formatNumber(pkg.totalCredits)} 积分</strong>
            <span>¥${escapeHtml(trimAmount(pkg.amount))}</span>
          </div>
        </div>
        <div class="credit-package-detail">
          <div class="credit-price"><small>¥</small>${escapeHtml(trimAmount(pkg.amount))}</div>
          <div class="credit-ratio">性价比：${ratio} 积分/元</div>
          <div class="credit-breakdown">
            <div><span>基础积分：</span><strong>${formatNumber(pkg.baseCredits)}</strong></div>
            <div class="bonus"><span>赠送积分：</span><strong>+${formatNumber(pkg.bonusCredits)}</strong></div>
            <div class="total"><span>总计积分：</span><strong>${formatNumber(pkg.totalCredits)}</strong></div>
          </div>
          <div class="credit-extra"><i data-lucide="badge-percent"></i><span>${bonusRate > 0 ? `额外获得 ${bonusRate}% 积分` : (pkg.id === "test" ? "仅用于支付链路测试" : "无额外赠送积分")}</span></div>
          <div class="credit-pay-buttons">
            <button class="button button-primary credit-pay-button" type="button" data-buy-package="${escapeHtml(pkg.id)}" data-pay-method="alipay">
              <i data-lucide="credit-card"></i>支付宝
            </button>
            <button class="button credit-pay-button credit-pay-wechat" type="button" data-buy-package="${escapeHtml(pkg.id)}" data-pay-method="wechat">
              <i data-lucide="message-circle"></i>微信支付
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  creditEls.packages.querySelectorAll("[data-package-id]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("[data-buy-package]")) return;
      selectedPackageId = card.dataset.packageId;
      renderCreditPackages();
      window.lucide?.createIcons();
    });
  });

  creditEls.packages.querySelectorAll("[data-buy-package]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      selectedPackageId = button.dataset.buyPackage;
      selectedPayMethod = button.dataset.payMethod || "alipay";
      createCreditPayment(button).catch((error) => {
        const msg = error.message || String(error);
        // 支付平台不稳定的错误给出明确的重试提示
        const isNetworkError = /不稳定|连接|超时|网络/.test(msg);
        setCreditStatus(
          isNetworkError ? `${msg} 请稍候再次点击该套餐的支付按钮重试。` : msg,
          "error"
        );
      });
    });
  });

  window.lucide?.createIcons();
}

async function sendEmailCode(button) {
  await wrapAuth(async () => {
    const mode = button.dataset.sendCode;
    const form = button.closest("form");
    const email = form?.elements.email.value.trim() || "";
    const cooldownKey = getCooldownKey(mode, email);
    const existingEndAt = Number(localStorage.getItem(cooldownKey) || 0);
    if (existingEndAt > Date.now()) {
      startCodeCountdown(button, existingEndAt);
      return;
    }

    const result = await creditApi(mode === "reset" ? "sendResetPasswordCode" : "sendRegisterCode", { email });
    const seconds = Number(result.cooldown || 60);
    startCodeCountdown(button, Date.now() + seconds * 1000);
    setAuthStatus(result.reused
      ? "验证码已发送，请勿重复点击；请查看邮箱或稍等。"
      : "验证码已发送，请查看邮箱；如果没有看到，请检查垃圾箱或稍等 1 分钟。",
      "success"
    );
  });
}

function restoreCodeCountdown(button) {
  const form = button.closest("form");
  const emailInput = form?.elements.email;
  const refresh = () => {
    const email = emailInput?.value.trim() || "";
    const endAt = Number(localStorage.getItem(getCooldownKey(button.dataset.sendCode, email)) || 0);
    if (endAt > Date.now()) startCodeCountdown(button, endAt);
  };
  emailInput?.addEventListener("change", refresh);
  refresh();
}

function startCodeCountdown(button, endAt) {
  const originalText = button.dataset.originalText || button.textContent || "获取验证码";
  button.dataset.originalText = originalText;
  const form = button.closest("form");
  const email = form?.elements.email.value.trim() || "";
  localStorage.setItem(getCooldownKey(button.dataset.sendCode, email), String(endAt));
  button.disabled = true;

  const render = () => {
    const remain = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    if (remain <= 0) {
      window.clearInterval(Number(button.dataset.timer || 0));
      button.dataset.timer = "";
      button.disabled = false;
      button.textContent = "再次发送验证码";
      localStorage.removeItem(getCooldownKey(button.dataset.sendCode, email));
      return;
    }
    button.textContent = `${remain}s`;
  };

  window.clearInterval(Number(button.dataset.timer || 0));
  button.dataset.timer = String(window.setInterval(render, 250));
  render();
}

// ===================== 支付链路（重构） =====================

async function createCreditPayment(triggerButton) {
  if (!accountState?.token) {
    openAuthModal("login");
    setAuthStatus("请先登录，再购买积分。", "error");
    return;
  }
  if (!creditConfig?.enabled) throw new Error("在线充值暂未开启。");
  stopCreditPolling();
  stopCountdown();
  // 仅禁用被点击的按钮防止重复点击，不改变按钮内容避免 UI 错乱
  if (triggerButton) triggerButton.disabled = true;
  try {
    const order = await creditApi("createCreditOrder", {
      accountToken: accountState.token,
      packageId: selectedPackageId,
      method: selectedPayMethod,
      device: detectEpayDevice()
    });
    activeOrder = order;
    saveActiveOrder(activeOrder);
    // 始终在页内弹窗渲染二维码，杜绝跳转支付平台 HTML 导致的乱码
    openPayModal(order);
    startPolling();
    await queryActiveOrder();
  } finally {
    if (triggerButton) triggerButton.disabled = false;
  }
}

async function queryActiveOrder() {
  if (!activeOrder?.outTradeNo || !accountState?.token) return;
  if (payState === "success" || payState === "closed") return;
  setPayState("querying");
  try {
    const result = await creditApi("queryCreditOrder", {
      accountToken: accountState.token,
      outTradeNo: activeOrder.outTradeNo
    });
    activeOrder = result.order || activeOrder;
    saveActiveOrder(activeOrder);
    if (result.account) {
      accountState.account = result.account;
      saveCreditState(accountState);
      updateAccountView();
    }
    queryFailCount = 0;
    const viewStatus = activeOrder.viewStatus || mapViewStatus(activeOrder.status);
    if (viewStatus === "paid") {
      onPaymentSuccess(result);
    } else if (viewStatus === "expired") {
      setPayState("expired");
      setPaymentInfo(result.message || "二维码已过期，请刷新二维码或重新购买。", "error");
    } else if (viewStatus === "closed") {
      setPayState("closed");
      stopCreditPolling();
      saveActiveOrder(null);
      setPaymentInfo(result.message || "订单已关闭，请重新购买。", "error");
    } else {
      setPayState("pending");
      setPaymentInfo(result.message || `订单等待支付，请使用${activeOrder?.method === "wechat" ? "微信" : "支付宝"}扫码。`);
    }
  } catch (error) {
    queryFailCount += 1;
    if (queryFailCount >= POLL_MAX_FAIL) {
      stopCreditPolling();
      showPayError(error.message || "订单查询失败，请检查网络后重试。", () => {
        clearPayError();
        startPolling();
        queryActiveOrder();
      });
    } else {
      setPayState("pending");
      setPaymentInfo(`网络异常，正在重试（${queryFailCount}/${POLL_MAX_FAIL}）...`);
    }
  }
}

async function refreshQrCode() {
  if (!activeOrder?.outTradeNo || !accountState?.token) return;
  if (!activeOrder.refreshable) {
    showPayError("刷新次数已达上限，请重新购买。", null);
    return;
  }
  setPayState("loading");
  setPaymentInfo("正在刷新二维码...");
  try {
    const order = await creditApi("refreshCreditQrCode", {
      accountToken: accountState.token,
      outTradeNo: activeOrder.outTradeNo,
      device: detectEpayDevice()
    });
    activeOrder = order;
    saveActiveOrder(activeOrder);
    renderPayModalOrder(activeOrder);
    setPayState("pending");
    setPaymentInfo("二维码已刷新，请重新扫码支付。");
    queryFailCount = 0;
    startPolling();
    await queryActiveOrder();
  } catch (error) {
    showPayError(error.message || "刷新二维码失败，请重试。", refreshQrCode);
  }
}

function onPaymentSuccess(result) {
  stopCreditPolling();
  stopCountdown();
  saveActiveOrder(null);
  setPayState("success");
  const credited = result.creditedCredits || activeOrder.totalCredits || 0;
  const successMsg = result.message || `支付成功，已到账 ${formatNumber(credited)} 积分。`;
  setPaymentInfo(successMsg, "success");
  setCreditStatus(successMsg, "success");
  // 1.6 秒后自动关闭弹窗
  window.setTimeout(() => closePayModal(), 1600);
}

function openPayModal(order) {
  if (!creditEls.payModal) return;
  creditEls.payModal.hidden = false;
  queryFailCount = 0;
  renderPayModalOrder(order);
  setPayState(order.qrDataUrl ? "pending" : "loading");
  const methodLabel = order.method === "wechat" ? "微信" : "支付宝";
  setPaymentInfo(`订单已创建，请使用${methodLabel}扫码支付。`);
  startCountdown(order.expiresAt);
  window.lucide?.createIcons();
}

function renderPayModalOrder(order) {
  if (creditEls.paymentQr && order.qrDataUrl) {
    creditEls.paymentQr.src = order.qrDataUrl;
    creditEls.paymentQr.hidden = false;
  }
  if (creditEls.payAmount) creditEls.payAmount.textContent = trimAmount(order.amount);
  if (creditEls.payOrderNo) creditEls.payOrderNo.textContent = order.outTradeNo || "-";
  if (creditEls.payPackage) creditEls.payPackage.textContent = order.packageName || "-";
  if (creditEls.payCredits) {
    const bonus = Number(order.oldUserBonus) || 0;
    creditEls.payCredits.textContent = bonus > 0
      ? `${formatNumber(Number(order.totalCredits) + bonus)} 积分（含老用户赠送 ${formatNumber(bonus)}）`
      : `${formatNumber(order.totalCredits)} 积分`;
  }
  startCountdown(order.expiresAt);
}

function closePayModal() {
  if (creditEls.payModal) creditEls.payModal.hidden = true;
  stopCreditPolling();
  stopCountdown();
  payState = "idle";
}

function startPolling() {
  stopCreditPolling();
  pollTimer = window.setInterval(queryActiveOrder, POLL_INTERVAL_MS);
}

function stopCreditPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }
}

function startCountdown(expiresAt) {
  stopCountdown();
  if (!expiresAt) return;
  const endAt = new Date(expiresAt).getTime();
  if (!Number.isFinite(endAt)) return;
  const tick = () => {
    const remain = Math.max(0, endAt - Date.now());
    if (creditEls.payCountdown) {
      const totalSec = Math.ceil(remain / 1000);
      const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
      const ss = String(totalSec % 60).padStart(2, "0");
      creditEls.payCountdown.textContent = `${mm}:${ss}`;
      creditEls.payCountdown.classList.toggle("urgent", totalSec <= 60);
    }
    if (remain <= 0) {
      stopCountdown();
      // 倒计时归零：本地置过期态并露出刷新按钮；真实 expired 状态由下一次轮询确认
      if (payState === "pending" || payState === "querying") {
        setPayState("expired");
        setPaymentInfo("二维码已过期，请刷新二维码或重新购买。", "error");
      }
    }
  };
  tick();
  countdownTimer = window.setInterval(tick, 1000);
}

function stopCountdown() {
  if (countdownTimer) {
    window.clearInterval(countdownTimer);
    countdownTimer = 0;
  }
}

function startEarlyBirdCountdown() {
  stopEarlyBirdCountdown();
  const render = () => {
    const nodes = document.querySelectorAll("[data-aug-promo-countdown]");
    const deadlineNodes = document.querySelectorAll("[data-aug-promo-deadline]");
    if (!nodes.length && !deadlineNodes.length) {
      stopEarlyBirdCountdown();
      return;
    }

    const remain = Math.max(0, EARLY_BIRD_DEADLINE - Date.now());
    const totalSec = Math.floor(remain / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const expired = remain <= 0;
    const units = [
      [days, "天"],
      [hours, "时"],
      [minutes, "分"],
      [seconds, "秒"]
    ];

    nodes.forEach((node) => {
      node.innerHTML = units.map(([value, label]) => `
        <span><strong>${String(value).padStart(2, "0")}</strong><small>${label}</small></span>
      `).join("");
      node.classList.toggle("is-expired", expired);
    });
    deadlineNodes.forEach((node) => {
      node.textContent = expired ? "优惠已结束" : "2026-08-31 23:59";
    });

    if (expired) {
      stopEarlyBirdCountdown();
    }
  };
  render();
  earlyBirdTimer = window.setInterval(render, 1000);
}

function stopEarlyBirdCountdown() {
  if (earlyBirdTimer) {
    window.clearInterval(earlyBirdTimer);
    earlyBirdTimer = 0;
  }
}

// 支付状态机：pending(待支付) / querying(确认中) / loading(出码中) / success(已支付) / expired(过期) / closed(已关闭) / error(异常)
function setPayState(state) {
  payState = state;
  const stage = creditEls.payQrStage;
  if (!stage) return;
  stage.classList.toggle("is-pending", state === "pending" || state === "querying");
  stage.classList.toggle("is-loading", state === "loading");
  stage.classList.toggle("is-success", state === "success");
  stage.classList.toggle("is-expired", state === "expired" || state === "closed" || state === "error");
  if (creditEls.payLoading) creditEls.payLoading.hidden = state !== "loading";
  if (creditEls.paySuccess) creditEls.paySuccess.hidden = state !== "success";
  if (creditEls.payQrMask) {
    // loading 态只显示 spinner 遮罩，不重复显示文字蒙层
    const masked = state === "expired" || state === "closed" || state === "error";
    creditEls.payQrMask.hidden = !masked;
  }
  if (creditEls.payMaskInner) {
    creditEls.payMaskInner.textContent = state === "loading"
      ? "正在生成二维码"
      : state === "closed"
        ? "订单已关闭"
        : state === "error"
          ? "加载失败"
          : "二维码已过期";
  }
  // 刷新按钮：仅过期态且订单仍可刷新时显示
  if (creditEls.payRefresh) {
    creditEls.payRefresh.hidden = !(state === "expired" && activeOrder?.refreshable);
  }
  // 成功态时重放勾选动画
  if (state === "success" && creditEls.paySuccess) {
    creditEls.paySuccess.classList.remove("animate");
    void creditEls.paySuccess.offsetWidth;
    creditEls.paySuccess.classList.add("animate");
  }
}

function showPayError(message, retryFn) {
  setPayState("error");
  setPaymentInfo(message || "发生异常，请重试。", "error");
  const retryBtn = document.querySelector("[data-pay-retry]");
  if (retryBtn) {
    retryBtn.hidden = !retryFn;
    retryBtn.onclick = retryFn || null;
  }
}

function clearPayError() {
  const retryBtn = document.querySelector("[data-pay-retry]");
  if (retryBtn) retryBtn.hidden = true;
}

function mapViewStatus(status) {
  if (status === "paid") return "paid";
  if (status === "expired") return "expired";
  if (["closed", "failed"].includes(status)) return "closed";
  return "pending";
}

// ===================== 账户 / 认证（保持兼容） =====================

function handleAccountButtonClick() {
  if (accountState?.token && accountState?.account) {
    toggleAccountMenu();
    return;
  }
  openAuthModal("login");
}

function openAuthModal(tab = "login") {
  closeAccountMenu();
  creditEls.authModal.hidden = false;
  switchAuthTab(tab);
  setAuthStatus("");
  window.lucide?.createIcons();
}

function closeAuthModal() {
  creditEls.authModal.hidden = true;
}

function switchAuthTab(tab) {
  creditEls.authTabs.forEach((button) => button.classList.toggle("active", button.dataset.authTab === tab));
  creditEls.authForms.forEach((form) => form.classList.toggle("active", form.dataset.authForm === tab));
  const titles = { login: "登录账户", register: "注册账户", reset: "找回密码" };
  const title = document.querySelector("#auth-title");
  if (title) title.textContent = titles[tab] || titles.login;
}

function toggleAccountMenu() {
  if (!creditEls.accountMenu) return;
  if (creditEls.accountMenu.hidden) openAccountMenu();
  else closeAccountMenu();
}

function openAccountMenu() {
  if (!creditEls.accountMenu) return;
  updateAccountView();
  creditEls.accountMenu.hidden = false;
  window.lucide?.createIcons();
}

function closeAccountMenu() {
  if (creditEls.accountMenu) creditEls.accountMenu.hidden = true;
}

function logoutAccount() {
  accountState = null;
  activeOrder = null;
  saveCreditState(null);
  saveActiveOrder(null);
  stopCreditPolling();
  stopCountdown();
  closeAccountMenu();
  closePayModal();
  closeReferralModal();
  updateAccountView();
  setCreditStatus("已退出登录。");
}

function setLoggedIn(result) {
  accountState = {
    token: result.token,
    account: result.account
  };
  saveCreditState(accountState);
  updateAccountView();
  resumeActiveOrderQuery();
}

async function refreshAccountProfile() {
  try {
    const result = await creditApi("getAccountProfile", { accountToken: accountState.token });
    accountState.account = result.account;
    saveCreditState(accountState);
    updateAccountView();
  } catch {
    accountState = null;
    saveCreditState(null);
    updateAccountView();
  }
}

function updateAccountView() {
  const account = accountState?.account;
  const loggedIn = Boolean(accountState?.token && account);
  creditEls.headerAccounts.forEach((el) => {
    el.textContent = loggedIn ? account.email : "登录";
  });
  if (creditEls.accountTitle) creditEls.accountTitle.textContent = loggedIn ? account.email : "尚未登录";
  if (creditEls.accountSubtitle) {
    creditEls.accountSubtitle.textContent = loggedIn
      ? `当前余额 ${formatNumber(account.credits)} 积分`
      : "登录后可查看余额并充值";
  }
  if (creditEls.logout) creditEls.logout.hidden = !loggedIn;
  if (creditEls.menuEmail) creditEls.menuEmail.textContent = loggedIn ? account.email : "尚未登录";
  if (creditEls.menuCredits) creditEls.menuCredits.textContent = loggedIn ? `${formatNumber(account.credits)} 积分` : "--";
  if (!loggedIn) closeAccountMenu();
  document.querySelectorAll("[data-open-auth]").forEach((button) => {
    if (!button.closest(".credit-account-panel")) return;
    button.textContent = loggedIn ? "账户已登录" : "登录";
    button.disabled = loggedIn;
  });
  // 邀请代理入口仅在登录后显示
  document.querySelectorAll("[data-open-referral]").forEach((button) => {
    button.hidden = !loggedIn;
  });
  // 老用户充值额外赠送横幅：仅累计充值过的用户可见
  if (creditEls.oldUserBonus) {
    creditEls.oldUserBonus.hidden = !(loggedIn && Number(account?.totalChargedCredits) > 0);
  }
}

async function creditApi(action, payload) {
  const response = await fetch(CREDIT_API_ENDPOINT, {
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

function ensureCreditModals() {
  if (!document.querySelector("[data-account-menu]")) {
    document.body.insertAdjacentHTML("beforeend", `
      <section class="account-popover" data-account-menu hidden aria-label="账户信息">
        <div class="account-popover-head">
          <span class="platform-icon platform-icon-blue"><i data-lucide="user-round"></i></span>
          <div>
            <strong data-account-menu-email>尚未登录</strong>
            <p>积分账户</p>
          </div>
        </div>
        <div class="account-popover-balance">
          <span>当前余额</span>
          <strong data-account-menu-credits>--</strong>
        </div>
        <button class="button button-primary account-menu-referral" type="button" data-open-referral hidden><i data-lucide="gift"></i>邀请代理</button>
        <button class="button button-manual" type="button" data-account-menu-logout>退出账号</button>
      </section>
    `);
  }

  if (!document.querySelector("[data-auth-modal]")) {
    document.body.insertAdjacentHTML("beforeend", `
      <div class="credit-modal" data-auth-modal hidden>
        <div class="credit-modal-backdrop" data-close-auth></div>
        <section class="credit-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button class="credit-close" type="button" aria-label="关闭" data-close-auth><i data-lucide="x"></i></button>
          <p class="section-kicker">账户中心</p>
          <h2 id="auth-title">登录账户</h2>
          <form class="auth-form active" data-auth-form="login">
            <label>邮箱<input name="email" type="email" autocomplete="email" required /></label>
            <label>密码<input name="password" type="password" autocomplete="current-password" required /></label>
            <button class="button button-primary" type="submit">登录</button>
            <p class="auth-switch">没有账号？<button type="button" data-auth-tab="register">立即注册</button><span>/</span><button type="button" data-auth-tab="reset">忘记密码</button></p>
          </form>
          <form class="auth-form" data-auth-form="register">
            <div class="register-bonus"><i data-lucide="badge-plus"></i><span>注册成功立即赠送 50 积分</span></div>
            <p class="auth-hint">请使用未注册过的新邮箱。已注册邮箱不会重复发送注册验证码，可直接登录或找回密码。</p>
            <label>邮箱<input name="email" type="email" autocomplete="email" required /></label>
            <div class="code-row">
              <label>验证码<input name="code" inputmode="numeric" maxlength="6" required /></label>
              <button class="button button-manual" type="button" data-send-code="register">获取验证码</button>
            </div>
            <label>邀请码（选填）<input name="inviteCode" type="text" placeholder="有邀请码可额外获得积分" autocomplete="off" /></label>
            <label>密码<input name="password" type="password" autocomplete="new-password" minlength="8" required /></label>
            <button class="button button-primary" type="submit">注册并登录</button>
            <p class="auth-switch">已有账号？<button type="button" data-auth-tab="login">返回登录</button></p>
          </form>
          <form class="auth-form" data-auth-form="reset">
            <label>邮箱<input name="email" type="email" autocomplete="email" required /></label>
            <div class="code-row">
              <label>验证码<input name="code" inputmode="numeric" maxlength="6" required /></label>
              <button class="button button-manual" type="button" data-send-code="reset">获取验证码</button>
            </div>
            <label>新密码<input name="password" type="password" autocomplete="new-password" minlength="8" required /></label>
            <button class="button button-primary" type="submit">重置密码</button>
            <p class="auth-switch">想起来了？<button type="button" data-auth-tab="login">返回登录</button></p>
          </form>
          <p class="credit-status" data-auth-status></p>
        </section>
      </div>
    `);
  }

  // 支付弹窗：左二维码 + 右订单信息，含倒计时、状态机、刷新、成功动画
  if (!document.querySelector("[data-pay-modal]")) {
    document.body.insertAdjacentHTML("beforeend", `
      <div class="credit-modal qm-pay-modal" data-pay-modal hidden>
        <div class="credit-modal-backdrop" data-close-pay></div>
        <section class="credit-dialog qm-pay-dialog" role="dialog" aria-modal="true" aria-labelledby="pay-title">
          <button class="credit-close" type="button" aria-label="关闭" data-close-pay><i data-lucide="x"></i></button>
          <div class="qm-pay-layout">
            <div class="qm-pay-qr-wrap">
              <div class="qm-pay-qr-stage is-pending" data-pay-qr-stage>
                <img class="qm-pay-qr" data-payment-qr alt="支付宝支付二维码" hidden />
                <div class="qm-pay-qr-mask" data-pay-qr-mask hidden>
                  <div class="qm-pay-qr-mask-inner" data-pay-mask-inner>二维码已过期</div>
                </div>
                <div class="qm-pay-loading" data-pay-loading hidden><span class="qm-spinner" aria-hidden="true"></span></div>
                <div class="qm-pay-success" data-pay-success hidden>
                  <svg class="qm-pay-check" viewBox="0 0 52 52" aria-hidden="true">
                    <circle class="qm-check-circle" cx="26" cy="26" r="24"></circle>
                    <path class="qm-check-path" d="M14 27l8 8 16-16"></path>
                  </svg>
                  <span class="qm-pay-success-text">支付成功</span>
                </div>
              </div>
              <p class="qm-pay-qr-tip">请使用 <strong>支付宝</strong> 扫码支付</p>
              <button class="button button-primary qm-refresh-btn" type="button" data-pay-refresh hidden><i data-lucide="refresh-cw"></i>刷新二维码</button>
            </div>
            <div class="qm-pay-info">
              <p class="section-kicker">支付宝支付</p>
              <h2 id="pay-title">扫码完成积分充值</h2>
              <div class="qm-pay-amount"><small>¥</small><span data-pay-amount>0</span></div>
              <dl class="qm-pay-meta">
                <div><dt>订单号</dt><dd data-pay-order-no>-</dd></div>
                <div><dt>套餐</dt><dd data-pay-package>-</dd></div>
                <div><dt>到账积分</dt><dd data-pay-credits>-</dd></div>
                <div><dt>剩余有效期</dt><dd data-pay-countdown class="qm-countdown">--:--</dd></div>
              </dl>
              <p class="credit-status qm-pay-status" data-payment-info>订单创建后将在这里显示二维码。</p>
              <div class="qm-pay-actions">
                <button class="button button-primary" type="button" data-pay-retry hidden>重试</button>
                <button class="button button-secondary" type="button" data-close-pay>取消</button>
              </div>
              <p class="qm-pay-foot">支付完成后积分将自动到账并关闭弹窗<br>如支付超时，请点击下方刷新二维码</p>
              <button class="button button-primary qm-refresh-btn" type="button" data-pay-refresh hidden><i data-lucide="refresh-cw"></i>刷新二维码</button>
            </div>
          </div>
        </section>
      </div>
    `);
  }

  // 邀请代理弹窗
  if (!document.querySelector("[data-referral-modal]")) {
    document.body.insertAdjacentHTML("beforeend", `
      <div class="credit-modal" data-referral-modal hidden>
        <div class="credit-modal-backdrop" data-close-referral></div>
        <section class="credit-dialog referral-panel" role="dialog" aria-modal="true" aria-labelledby="referral-title">
          <button class="credit-close" type="button" aria-label="关闭" data-close-referral><i data-lucide="x"></i></button>
          <p class="section-kicker">推广中心</p>
          <h2 id="referral-title">邀请和代理</h2>
          <div class="referral-tabs">
            <button class="referral-tab active" type="button" data-referral-tab="overview">总览</button>
            <button class="referral-tab" type="button" data-referral-tab="referrals">邀请明细</button>
            <button class="referral-tab" type="button" data-referral-tab="commissions">提成记录</button>
            <button class="referral-tab" type="button" data-referral-tab="withdrawal">提现</button>
          </div>
          <div class="referral-content">
            <div class="referral-panel-section active" data-referral-section="overview">
              <div class="referral-overview-loading">加载中...</div>
            </div>
            <div class="referral-panel-section" data-referral-section="referrals">
              <div class="referral-table-wrap"><table class="referral-table"><thead><tr><th>被邀请人邮箱</th><th>状态</th><th>注册时间</th><th>使用时间</th><th>充值总额</th><th>提成总额</th></tr></thead><tbody data-referral-body="referrals"></tbody></table></div>
              <div class="referral-pagination" data-referral-pagination="referrals"></div>
            </div>
            <div class="referral-panel-section" data-referral-section="commissions">
              <div class="referral-table-wrap"><table class="referral-table"><thead><tr><th>被邀请人邮箱</th><th>订单号</th><th>充值金额</th><th>提成比例</th><th>提成金额</th><th>状态</th><th>时间</th></tr></thead><tbody data-referral-body="commissions"></tbody></table></div>
              <div class="referral-pagination" data-referral-pagination="commissions"></div>
            </div>
            <div class="referral-panel-section" data-referral-section="withdrawal">
              <div class="referral-withdrawal-summary" data-referral-withdrawal-summary>加载中...</div>
              <div class="referral-withdrawal-form">
                <h3>申请提现</h3>
                <p class="referral-withdrawal-notice">佣金累计满 50 元可申请提现，客服审核后通过支付宝打款</p>
                <label>支付宝账号<input type="text" data-referral-alipay-account placeholder="支付宝账号（手机号或邮箱）" /></label>
                <label>支付宝实名<input type="text" data-referral-alipay-name placeholder="支付宝实名认证姓名" /></label>
                <button class="button button-primary" type="button" data-referral-submit-withdrawal>提交提现申请</button>
              </div>
              <div class="referral-table-wrap"><table class="referral-table"><thead><tr><th>金额</th><th>支付宝账号</th><th>状态</th><th>打款订单号</th><th>打款时间</th><th>申请时间</th></tr></thead><tbody data-referral-body="withdrawal"></tbody></table></div>
              <div class="referral-pagination" data-referral-pagination="withdrawal"></div>
            </div>
          </div>
          <p class="credit-status" data-referral-status></p>
        </section>
      </div>
    `);
  }

  // 邀请代理入口已移至账户弹窗内，不再在导航栏插入

  // URL 参数自动带入邀请码
  const refCode = new URLSearchParams(window.location.search).get("ref") || new URLSearchParams(window.location.hash.split("?")[1] || "").get("ref");
  if (refCode) {
    const inviteInput = document.querySelector("[data-auth-form='register'] [name='inviteCode']");
    if (inviteInput) inviteInput.value = refCode.toUpperCase();
  }
}

// ===================== 邀请代理功能 =====================

const referralState = {
  activeTab: "overview",
  pages: {
    referrals: { page: 1, pageSize: 10, total: 0, totalPages: 1, items: [] },
    commissions: { page: 1, pageSize: 10, total: 0, totalPages: 1, items: [] },
    withdrawal: { page: 1, pageSize: 10, total: 0, totalPages: 1, items: [] }
  },
  overview: null
};

function bindReferralEvents() {
  // 打开邀请面板
  document.querySelectorAll("[data-open-referral]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!accountState?.token) {
        openAuthModal("login");
        setAuthStatus("请先登录后查看邀请代理。", "error");
        return;
      }
      openReferralModal();
    });
  });

  // 关闭邀请面板
  document.querySelectorAll("[data-close-referral]").forEach((button) => {
    button.addEventListener("click", closeReferralModal);
  });

  // 标签切换
  document.querySelectorAll("[data-referral-tab]").forEach((button) => {
    button.addEventListener("click", () => switchReferralTab(button.dataset.referralTab));
  });

  // 提交提现
  document.querySelector("[data-referral-submit-withdrawal]")?.addEventListener("click", submitWithdrawal);
}

function openReferralModal() {
  const modal = document.querySelector("[data-referral-modal]");
  if (!modal) return;
  modal.hidden = false;
  switchReferralTab("overview");
  window.lucide?.createIcons();
}

function closeReferralModal() {
  const modal = document.querySelector("[data-referral-modal]");
  if (modal) modal.hidden = true;
}

function switchReferralTab(tab) {
  referralState.activeTab = tab;
  document.querySelectorAll("[data-referral-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.referralTab === tab);
  });
  document.querySelectorAll("[data-referral-section]").forEach((section) => {
    section.classList.toggle("active", section.dataset.referralSection === tab);
  });
  if (tab === "overview") loadReferralOverview();
  if (tab === "referrals") loadReferralList();
  if (tab === "commissions") loadCommissionRecords();
  if (tab === "withdrawal") loadWithdrawalRecords();
}

async function loadReferralOverview() {
  if (!accountState?.token) return;
  const section = document.querySelector("[data-referral-section='overview']");
  if (!section) return;
  section.innerHTML = `<div class="referral-overview-loading">加载中...</div>`;
  try {
    const data = await creditApi("getReferralOverview", { accountToken: accountState.token });
    referralState.overview = data;
    renderReferralOverview(data);
  } catch (error) {
    section.innerHTML = `<div class="referral-overview-loading referral-error">${escapeHtml(error.message || "加载失败")}</div>`;
  }
}

function renderReferralOverview(data) {
  const section = document.querySelector("[data-referral-section='overview']");
  if (!section) return;
  const inviteCode = data.inviteCode || "未生成";
  const inviteLink = data.inviteLink || (inviteCode !== "未生成" ? `${window.location.origin}/?ref=${encodeURIComponent(inviteCode)}` : "");
  const shareText = `我发现一个很神奇的不切屏、不截屏、后台无法捕获的答题悬浮球助手，效果非常惊艳。注册时填邀请码 ${inviteCode} 可额外获得积分，快来看看吧！${inviteLink}`;
  const stats = data.stats || {};
  const commission = data.commission || {};
  const pendingAmount = Number(commission.pending || 0);
  const canWithdraw = pendingAmount >= 50;
  section.innerHTML = `
    <div class="referral-promo-box">
      <div class="referral-promo-hero">
        <h3>邀请好友，双方各得 20 积分</h3>
        <p>不截屏 · 不切屏 · 后台无法捕获，注册即得积分</p>
      </div>
      <div class="referral-share-box">
        <label>分享文案</label>
        <textarea readonly>${escapeHtml(shareText)}</textarea>
        <div class="referral-share-actions">
          <button class="button button-manual referral-copy-btn" type="button" data-copy-text="${escapeHtml(shareText)}"><i data-lucide="copy"></i>复制文案</button>
        </div>
      </div>
      <div class="referral-poster-section">
        <label>邀请海报</label>
        <p class="referral-poster-hint">生成专属海报，点击转发可直接分享到微信、小红书等</p>
        <div class="referral-poster-actions">
          <button class="button button-primary" type="button" data-referral-poster><i data-lucide="image"></i>生成邀请海报</button>
        </div>
        <div class="referral-poster-preview" data-referral-poster-preview style="display:none">
          <img alt="邀请海报" />
          <div class="referral-poster-buttons">
            <button class="button button-manual" type="button" data-referral-save-poster><i data-lucide="download"></i>保存海报</button>
            <button class="button button-primary" type="button" data-referral-share-poster><i data-lucide="share-2"></i>转发</button>
          </div>
          <p class="referral-poster-tip">点击"转发"可选择微信、小红书等 App 发送</p>
        </div>
      </div>
    </div>
    <div class="referral-stats">
      <div class="referral-stat"><span>已邀请</span><strong>${formatNumber(stats.totalInvited || stats.invited || 0)}</strong></div>
      <div class="referral-stat"><span>已注册</span><strong>${formatNumber(stats.registered || 0)}</strong></div>
      <div class="referral-stat"><span>已使用</span><strong>${formatNumber(stats.activated || stats.used || 0)}</strong></div>
    </div>
    <div class="referral-stats">
      <div class="referral-stat"><span>待结算佣金</span><strong>¥${formatNumber(pendingAmount)}</strong></div>
      <div class="referral-stat"><span>已结算佣金</span><strong>¥${formatNumber(commission.cleared || commission.settled || 0)}</strong></div>
      <div class="referral-stat"><span>提现中</span><strong>¥${formatNumber(commission.pendingWithdrawal || commission.withdrawing || 0)}</strong></div>
    </div>
    <div class="referral-actions">
      <button class="button button-primary" type="button" data-referral-goto-withdrawal ${canWithdraw ? '' : 'disabled'}>${canWithdraw ? '前往提现' : `佣金满50可提现（当前¥${formatNumber(pendingAmount)}）`}</button>
    </div>
    <div class="referral-detail-entry">
      <button class="button button-manual" type="button" data-referral-goto-referrals>查看邀请明细 →</button>
      <button class="button button-manual" type="button" data-referral-goto-commissions>查看提成记录 →</button>
    </div>
  `;
  // 复制文案
  section.querySelectorAll("[data-copy-text]").forEach((btn) => {
    btn.addEventListener("click", () => copyToClipboard(btn.dataset.copyText, btn));
  });
  // 前往提现
  section.querySelector("[data-referral-goto-withdrawal]")?.addEventListener("click", () => {
    if (canWithdraw) switchReferralTab("withdrawal");
  });
  // 查看明细
  section.querySelector("[data-referral-goto-referrals]")?.addEventListener("click", () => switchReferralTab("referrals"));
  section.querySelector("[data-referral-goto-commissions]")?.addEventListener("click", () => switchReferralTab("commissions"));
  // 生成海报
  section.querySelector("[data-referral-poster]")?.addEventListener("click", () => generateReferralPoster(inviteCode, inviteLink));
  // 保存海报
  section.querySelector("[data-referral-save-poster]")?.addEventListener("click", () => saveReferralPoster());
  // 转发海报
  section.querySelector("[data-referral-share-poster]")?.addEventListener("click", () => shareReferralPoster());
  window.lucide?.createIcons();
}

async function generateInviteCode() {
  if (!accountState?.token) return;
  try {
    setReferralStatus("正在生成邀请码...");
    await creditApi("generateInviteCode", { accountToken: accountState.token });
    setReferralStatus("邀请码已生成。", "success");
    await loadReferralOverview();
  } catch (error) {
    setReferralStatus(error.message || "生成失败", "error");
  }
}

async function loadReferralList() {
  if (!accountState?.token) return;
  const body = document.querySelector("[data-referral-body='referrals']");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="6">加载中...</td></tr>`;
  try {
    const t = referralState.pages.referrals;
    const data = await creditApi("getReferralList", { accountToken: accountState.token, page: t.page, pageSize: t.pageSize });
    t.items = data.items || [];
    t.total = Number(data.total || t.items.length);
    t.totalPages = Number(data.totalPages || Math.max(1, Math.ceil(t.total / t.pageSize)));
    renderReferralTable("referrals", t.items, ["email", "status", "registeredAt", "usedAt", "totalCharged", "totalCommission"], ["被邀请人邮箱", "状态", "注册时间", "使用时间", "充值总额", "提成总额"]);
    renderReferralPagination("referrals");
  } catch (error) {
    body.innerHTML = `<tr><td colspan="6" class="referral-error">${escapeHtml(error.message || "加载失败")}</td></tr>`;
  }
}

async function loadCommissionRecords() {
  if (!accountState?.token) return;
  const body = document.querySelector("[data-referral-body='commissions']");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="7">加载中...</td></tr>`;
  try {
    const t = referralState.pages.commissions;
    const data = await creditApi("getCommissionRecords", { accountToken: accountState.token, page: t.page, pageSize: t.pageSize });
    t.items = data.items || [];
    t.total = Number(data.total || t.items.length);
    t.totalPages = Number(data.totalPages || Math.max(1, Math.ceil(t.total / t.pageSize)));
    renderReferralTable("commissions", t.items, ["email", "orderNo", "chargeAmount", "commissionRate", "commissionAmount", "status", "createdAt"], ["被邀请人邮箱", "订单号", "充值金额", "提成比例", "提成金额", "状态", "时间"]);
    renderReferralPagination("commissions");
  } catch (error) {
    body.innerHTML = `<tr><td colspan="7" class="referral-error">${escapeHtml(error.message || "加载失败")}</td></tr>`;
  }
}

async function loadWithdrawalRecords() {
  if (!accountState?.token) return;
  // 先加载总览获取待结算金额
  try {
    if (!referralState.overview) {
      const data = await creditApi("getReferralOverview", { accountToken: accountState.token });
      referralState.overview = data;
    }
    const summary = document.querySelector("[data-referral-withdrawal-summary]");
    if (summary && referralState.overview?.commission) {
      const c = referralState.overview.commission;
      const pending = Number(c.pending || 0);
      const canWithdraw = pending >= 50;
      summary.innerHTML = `<span>待结算：<strong>¥${formatNumber(pending)}</strong></span><span>已结算：<strong>¥${formatNumber(c.cleared || c.settled || 0)}</strong></span><span>提现中：<strong>¥${formatNumber(c.pendingWithdrawal || c.withdrawing || 0)}</strong></span>${canWithdraw ? '' : `<span class="referral-threshold-hint">佣金满 50 元可提现，还差 ¥${formatNumber(50 - pending)}</span>`}`;
    }
  } catch { /* ignore */ }

  const body = document.querySelector("[data-referral-body='withdrawal']");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="6">加载中...</td></tr>`;
  try {
    const t = referralState.pages.withdrawal;
    const data = await creditApi("getWithdrawalRecords", { accountToken: accountState.token, page: t.page, pageSize: t.pageSize });
    t.items = data.items || [];
    t.total = Number(data.total || t.items.length);
    t.totalPages = Number(data.totalPages || Math.max(1, Math.ceil(t.total / t.pageSize)));
    renderReferralTable("withdrawal", t.items, ["amount", "alipayAccount", "status", "payOrderNo", "paidAt", "createdAt"], ["金额", "支付宝账号", "状态", "打款订单号", "打款时间", "申请时间"]);
    renderReferralPagination("withdrawal");
  } catch (error) {
    body.innerHTML = `<tr><td colspan="6" class="referral-error">${escapeHtml(error.message || "加载失败")}</td></tr>`;
  }
}

function renderReferralTable(type, items, keys, labels) {
  const body = document.querySelector(`[data-referral-body='${type}']`);
  if (!body) return;
  if (!items.length) {
    body.innerHTML = `<tr><td colspan="${labels.length}">暂无数据</td></tr>`;
    return;
  }
  body.innerHTML = items.map((item) => {
    return `<tr>${keys.map((key) => `<td>${formatReferralCell(item[key], key)}</td>`).join("")}</tr>`;
  }).join("");
}

function formatReferralCell(value, key) {
  if (value === undefined || value === null || value === "") return "-";
  // 状态字段翻译
  if (key === "status") {
    const map = {
      pending: "等待注册", registered: "已注册", used: "已使用", rewarded: "已奖励", same_device: "同设备不计入",
      settled: "已结算", settling: "待结算",
      pending_review: "待审核", approved: "审核通过", paid: "已打款", rejected: "已驳回"
    };
    return `<span class="referral-status-badge">${escapeHtml(map[value] || value)}</span>`;
  }
  // 金额字段
  if (key === "chargeAmount" || key === "amount" || key === "totalCharged" || key === "totalCommission" || key === "commissionAmount") {
    return `¥${escapeHtml(String(value))}`;
  }
  // 比例
  if (key === "commissionRate") {
    return `${escapeHtml(String(value))}%`;
  }
  // 时间字段
  if (key === "registeredAt" || key === "usedAt" || key === "createdAt" || key === "paidAt") {
    const time = new Date(value).getTime();
    if (Number.isFinite(time)) return escapeHtml(new Date(value).toLocaleString("zh-CN"));
    return escapeHtml(String(value));
  }
  return escapeHtml(String(value));
}

function renderReferralPagination(type) {
  const t = referralState.pages[type];
  const root = document.querySelector(`[data-referral-pagination='${type}']`);
  if (!root) return;
  root.innerHTML = `<span>共 ${t.total} 条</span><button class="button button-manual referral-page-btn" type="button" data-referral-page="prev" data-table="${type}" ${t.page <= 1 ? "disabled" : ""}>上一页</button><span>第 ${t.page} / ${t.totalPages} 页</span><button class="button button-manual referral-page-btn" type="button" data-referral-page="next" data-table="${type}" ${t.page >= t.totalPages ? "disabled" : ""}>下一页</button>`;
  root.querySelectorAll("[data-referral-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.referralPage;
      const tbl = btn.dataset.table;
      const page = referralState.pages[tbl];
      if (action === "prev") page.page = Math.max(1, page.page - 1);
      if (action === "next") page.page = Math.min(page.totalPages, page.page + 1);
      if (tbl === "referrals") loadReferralList();
      if (tbl === "commissions") loadCommissionRecords();
      if (tbl === "withdrawal") loadWithdrawalRecords();
    });
  });
}

async function submitWithdrawal() {
  if (!accountState?.token) return;
  const accountInput = document.querySelector("[data-referral-alipay-account]");
  const nameInput = document.querySelector("[data-referral-alipay-name]");
  const account = accountInput?.value.trim() || "";
  const name = nameInput?.value.trim() || "";
  if (!account) { setReferralStatus("请输入支付宝账号。", "error"); return; }
  if (!name) { setReferralStatus("请输入支付宝实名。", "error"); return; }
  // 检查佣金是否满 50 元
  const pending = Number(referralState.overview?.commission?.pending || 0);
  if (pending < 50) { setReferralStatus(`佣金累计满 50 元可提现，当前待结算 ¥${pending}。`, "error"); return; }
  try {
    setReferralStatus("正在提交...");
    await creditApi("requestWithdrawal", { accountToken: accountState.token, alipayAccount: account, alipayName: name });
    setReferralStatus("提现申请已提交。", "success");
    accountInput.value = "";
    nameInput.value = "";
    referralState.overview = null;
    await loadWithdrawalRecords();
  } catch (error) {
    setReferralStatus(error.message || "提交失败", "error");
  }
}

function copyToClipboard(text, button) {
  const showCopied = () => {
    if (!button) return;
    const original = button.innerHTML;
    button.innerHTML = `<i data-lucide="check"></i>已复制`;
    window.lucide?.createIcons();
    setTimeout(() => { button.innerHTML = original; window.lucide?.createIcons(); }, 1500);
  };
  // 优先使用 Clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(showCopied).catch(() => {
      fallbackCopy(text, button, showCopied);
    });
  } else {
    fallbackCopy(text, button, showCopied);
  }
}

// 降级复制方案（兼容不支持 Clipboard API 的浏览器）
function fallbackCopy(text, button, onSuccess) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    onSuccess();
  } catch {
    setReferralStatus("复制失败，请手动复制。", "error");
  }
  document.body.removeChild(textarea);
}

// ==================== 邀请海报生成 ====================

let referralPosterBlob = null; // 缓存生成的海报 Blob

// 动态加载 QRCode 库（多 CDN 回退 + API 兜底）
async function loadQRCodeLibrary() {
  if (window.QRCode) return;
  const CDN_URLS = [
    "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js",
    "https://cdn.bootcdn.net/ajax/libs/qrcode/1.5.3/qrcode.min.js",
    "https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js"
  ];
  for (const url of CDN_URLS) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        const timer = setTimeout(() => reject(new Error("timeout")), 8000);
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = () => { clearTimeout(timer); reject(new Error("load error")); };
        document.head.appendChild(script);
      });
      if (window.QRCode) return;
    } catch { /* 尝试下一个 CDN */ }
  }
  // 所有 CDN 都失败，不抛错——海报会用 API 兜底生成二维码
}

// 用 Canvas 绘制二维码（QRCode 库不可用时用 API 图片兜底）
async function drawQRCodeToCanvas(ctx, x, y, size, data) {
  if (window.QRCode && typeof QRCode.toCanvas === "function") {
    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, data, {
      width: size, margin: 1,
      color: { dark: "#0d3d7a", light: "#ffffff" },
      errorCorrectionLevel: "M"
    });
    ctx.drawImage(qrCanvas, x, y, size, size);
  } else {
    // API 兜底：通过图片加载二维码
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=1&color=0d3d7a&bgcolor=ffffff&data=${encodeURIComponent(data)}`;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      setTimeout(reject, 10000);
    });
    ctx.drawImage(img, x, y, size, size);
  }
}

// 生成邀请海报
async function generateReferralPoster(inviteCode, inviteLink) {
  if (!inviteCode || inviteCode === "未生成") {
    setReferralStatus("请先生成邀请码。", "error");
    return;
  }
  const btn = document.querySelector("[data-referral-poster]");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader"></i>生成中...'; window.lucide?.createIcons(); }
  try {
    await loadQRCodeLibrary();
    const canvas = document.createElement("canvas");
    canvas.width = 750;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d");
    await drawPoster(ctx, inviteCode, inviteLink);
    // 转为 Blob
    referralPosterBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
    const url = URL.createObjectURL(referralPosterBlob);
    const preview = document.querySelector("[data-referral-poster-preview]");
    const img = preview?.querySelector("img");
    if (img) img.src = url;
    if (preview) preview.style.display = "block";
    setReferralStatus("海报已生成，可保存或转发。", "success");
  } catch (error) {
    setReferralStatus(error.message || "海报生成失败", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="image"></i>生成邀请海报'; window.lucide?.createIcons(); }
  }
}

// 绘制海报到 Canvas
async function drawPoster(ctx, inviteCode, inviteLink) {
  const W = 750, H = 1200;

  // 1. 背景渐变
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#1e6fd6");
  bgGrad.addColorStop(0.5, "#1558a8");
  bgGrad.addColorStop(1, "#0d3d7a");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. 顶部装饰圆
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath(); ctx.arc(120, 100, 200, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.beginPath(); ctx.arc(650, 250, 150, 0, Math.PI * 2); ctx.fill();

  // 3. Logo 区域
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("QuizMate", W / 2, 100);
  ctx.font = "24px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("答题悬浮助手", W / 2, 138);

  // 4. 分隔线
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(100, 170); ctx.lineTo(W - 100, 170); ctx.stroke();

  // 5. 卖点标题
  ctx.fillStyle = "#ffd54f";
  ctx.font = "bold 38px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  ctx.fillText("不切屏 · 不截屏", W / 2, 230);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  ctx.fillText("后台无法捕获", W / 2, 280);
  ctx.font = "bold 26px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  ctx.fillStyle = "#ffd54f";
  ctx.fillText("注册即送 50 积分，填邀请码再得 20 积分", W / 2, 325);

  // 6. 卖点列表
  ctx.font = "24px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textAlign = "left";
  const features = [
    "• 全程不截图、不切屏、不弹窗",
    "• 后台录屏无法捕捉任何痕迹",
    "• 直接读取页面，智能作答",
    "• Windows / Mac / Android 全平台"
  ];
  features.forEach((text, i) => {
    ctx.fillText(text, 80, 390 + i * 40);
  });

  // 7. 邀请码卡片背景
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  roundRect(ctx, 75, 520, W - 150, 120, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  roundRect(ctx, 75, 520, W - 150, 120, 16);
  ctx.stroke();

  // 邀请码文字
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "22px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("我的邀请码", W / 2, 560);
  ctx.fillStyle = "#ffd54f";
  ctx.font = "bold 52px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  ctx.fillText(inviteCode, W / 2, 615);

  // 8. 二维码区域
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 250, 680, 250, 250, 12);
  ctx.fill();

  // 用 QRCode 库或 API 兜底生成二维码
  await drawQRCodeToCanvas(ctx, 265, 695, 220, inviteLink);

  // 二维码下方提示
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "22px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("扫码注册，自动填入邀请码", W / 2, 965);

  // 9. 底部引导文案
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "bold 22px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  ctx.fillText("不切屏 · 不截屏 · 后台无法捕获", W / 2, 1005);

  // 10. 底部
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "18px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  ctx.fillText("quizmate.cn", W / 2, 1060);
  ctx.font = "16px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  ctx.fillText("长按二维码或复制链接注册", W / 2, 1090);
}

// 圆角矩形辅助函数
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 保存海报到本地
function saveReferralPoster() {
  if (!referralPosterBlob) { setReferralStatus("请先生成海报。", "error"); return; }
  const url = URL.createObjectURL(referralPosterBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `QuizMate-邀请海报.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setReferralStatus("海报已保存。", "success");
}

// 分享文案（调用系统分享，像手机相册转发一样）
async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ title: "QuizMate 答题悬浮助手", text });
      return;
    } catch (error) {
      if (error.name === "AbortError") return; // 用户取消
    }
  }
  // 降级：复制到剪贴板
  try {
    await navigator.clipboard.writeText(text);
    setReferralStatus("文案已复制，可粘贴到微信、小红书等。", "success");
  } catch {
    setReferralStatus("请手动复制文案。", "error");
  }
}

// 转发海报（调用系统分享，像手机相册转发一样）
async function shareReferralPoster() {
  if (!referralPosterBlob) { setReferralStatus("请先生成海报。", "error"); return; }
  const file = new File([referralPosterBlob], "QuizMate-邀请海报.png", { type: "image/png" });
  // 优先使用 Web Share API（移动端浏览器支持，可直接调起微信/小红书等）
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: "QuizMate 答题悬浮助手",
        text: "注册即送50积分，填邀请码再得20积分！",
        files: [file]
      });
      setReferralStatus("转发成功。", "success");
      return;
    } catch (error) {
      if (error.name === "AbortError") return; // 用户取消
    }
  }
  // 降级：保存海报到本地
  saveReferralPoster();
  setReferralStatus("海报已保存，请在微信/小红书中选择图片发送。", "success");
}

function setReferralStatus(text, type = "") {
  const el = document.querySelector("[data-referral-status]");
  if (!el) return;
  el.textContent = text || "";
  el.className = `credit-status ${type}`.trim();
}

// 支付弹窗样式（作用域隔离，沿用主站设计令牌）
function injectPayStyles() {
  if (document.getElementById("qm-pay-styles")) return;
  const style = document.createElement("style");
  style.id = "qm-pay-styles";
  style.textContent = `
  .qm-pay-modal { z-index: 320; }
  .qm-pay-modal [hidden] { display: none !important; }
  .qm-pay-dialog { width: min(720px, 100%); padding: 26px 26px 22px; }
  .qm-pay-layout { display: grid; grid-template-columns: 280px 1fr; gap: 28px; align-items: start; }
  .qm-pay-qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .qm-pay-qr-stage { position: relative; width: 232px; height: 232px; border-radius: 14px; border: 1px solid var(--line); background: #fff; display: grid; place-items: center; overflow: hidden; }
  .qm-pay-qr { width: 212px; height: 212px; object-fit: contain; }
  .qm-pay-qr-stage.is-expired .qm-pay-qr,
  .qm-pay-qr-stage.is-loading .qm-pay-qr { filter: grayscale(1) blur(1.5px); opacity: .55; }
  .qm-pay-qr-mask { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(255,255,255,.78); backdrop-filter: blur(2px); }
  .qm-pay-qr-mask-inner { font-size: 15px; font-weight: 700; color: var(--ink); }
  .qm-pay-loading { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(255,255,255,.85); }
  .qm-spinner { width: 34px; height: 34px; border: 3px solid var(--line); border-top-color: var(--blue); border-radius: 50%; animation: qm-spin .8s linear infinite; }
  @keyframes qm-spin { to { transform: rotate(360deg); } }
  .qm-pay-success { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; background: #fff; }
  .qm-pay-success-text { font-size: 14px; font-weight: 700; color: var(--green); }
  .qm-pay-check { width: 78px; height: 78px; }
  .qm-check-circle { fill: none; stroke: var(--green); stroke-width: 2; stroke-dasharray: 151; stroke-dashoffset: 151; }
  .qm-check-path { fill: none; stroke: var(--green); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 48; stroke-dashoffset: 48; }
  .qm-pay-success.animate .qm-check-circle { animation: qm-circle .5s ease forwards; }
  .qm-pay-success.animate .qm-check-path { animation: qm-path .35s .4s ease forwards; }
  @keyframes qm-circle { to { stroke-dashoffset: 0; } }
  @keyframes qm-path { to { stroke-dashoffset: 0; } }
  .qm-pay-qr-tip { margin: 0; font-size: 13px; color: var(--muted); text-align: center; }
  .qm-pay-qr-tip strong { color: var(--blue); }
  .qm-refresh-btn { min-height: 40px; padding: 9px 16px; font-size: 14px; }
  .qm-pay-info { min-width: 0; }
  .qm-pay-info .section-kicker { margin: 0 0 4px; }
  .qm-pay-info h2 { margin: 0 0 12px; font-size: 22px; }
  .qm-pay-amount { font-size: 34px; font-weight: 800; color: var(--ink); line-height: 1; margin-bottom: 14px; }
  .qm-pay-amount small { font-size: 18px; font-weight: 700; margin-right: 2px; }
  .qm-pay-meta { margin: 0 0 12px; display: grid; gap: 8px; }
  .qm-pay-meta > div { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; padding: 7px 10px; background: var(--surface); border-radius: 7px; }
  .qm-pay-meta dt { color: var(--muted); }
  .qm-pay-meta dd { margin: 0; font-weight: 600; color: var(--ink); word-break: break-all; text-align: right; }
  .qm-countdown { font-variant-numeric: tabular-nums; color: var(--blue); }
  .qm-countdown.urgent { color: var(--red); }
  .qm-pay-status { margin: 8px 0 14px; min-height: 20px; }
  .qm-pay-actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .qm-pay-actions .button { flex: 1; min-height: 42px; }
  .qm-pay-foot { margin: 12px 0 0; font-size: 12px; color: var(--muted); }
  @media (max-width: 620px) {
    .qm-pay-dialog { padding: 20px 16px; }
    .qm-pay-layout { grid-template-columns: 1fr; gap: 18px; }
    .qm-pay-qr-wrap { margin: 0 auto; }
    .qm-pay-amount { font-size: 28px; }
  }
  `;
  document.head.appendChild(style);
}

function loadCreditState() {
  try {
    return JSON.parse(localStorage.getItem(CREDIT_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveCreditState(value) {
  if (!value) localStorage.removeItem(CREDIT_STORAGE_KEY);
  else localStorage.setItem(CREDIT_STORAGE_KEY, JSON.stringify(value));
}

function loadActiveOrder() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_ORDER_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveActiveOrder(value) {
  if (!value || ["paid", "closed", "failed", "expired"].includes(String(value.viewStatus || value.status || ""))) {
    localStorage.removeItem(ACTIVE_ORDER_STORAGE_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_ORDER_STORAGE_KEY, JSON.stringify({
    outTradeNo: value.outTradeNo,
    status: value.status,
    viewStatus: value.viewStatus,
    amount: value.amount,
    packageName: value.packageName,
    totalCredits: value.totalCredits,
    payUrl: value.payUrl,
    qrCode: value.qrCode,
    qrDataUrl: value.qrDataUrl,
    expiresAt: value.expiresAt,
    refreshable: value.refreshable
  }));
}

function resumeActiveOrderQuery() {
  if (!activeOrder?.outTradeNo || !accountState?.token) return;
  const viewStatus = activeOrder.viewStatus || mapViewStatus(activeOrder.status);
  if (["paid", "closed"].includes(viewStatus)) {
    saveActiveOrder(null);
    activeOrder = null;
    return;
  }
  // 不自动弹框，仅后台静默轮询订单状态
  startPolling();
  queryActiveOrder().catch((error) => setCreditStatus(error.message || String(error), "error"));
}

async function wrapAuth(task) {
  try {
    setAuthStatus("正在处理...");
    await task();
  } catch (error) {
    setAuthStatus(error.message || String(error), "error");
  }
}

function setCreditStatus(text, type = "") {
  if (!creditEls.status) return;
  creditEls.status.textContent = text || "";
  creditEls.status.className = `credit-status ${type}`.trim();
}

function setAuthStatus(text, type = "") {
  if (!creditEls.authStatus) return;
  creditEls.authStatus.textContent = text || "";
  creditEls.authStatus.className = `credit-status ${type}`.trim();
}

function setPaymentInfo(text, type = "") {
  if (!creditEls.paymentInfo) return;
  creditEls.paymentInfo.textContent = text || "";
  creditEls.paymentInfo.className = `credit-status qm-pay-status ${type}`.trim();
}

function getCooldownKey(mode, email) {
  return `${CODE_COOLDOWN_PREFIX}:${mode || "code"}:${String(email || "").toLowerCase()}`;
}

function detectEpayDevice() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("micromessenger")) return "wechat";
  if (ua.includes("alipay")) return "alipay";
  if (/android|iphone|ipad|mobile/.test(ua)) return "mobile";
  return "pc";
}

function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod|Mobile|MQQBrowser|MicroMessenger|AlipayClient/i.test(navigator.userAgent || "");
}

function packageDescription(id) {
  return {
    test: "仅供测试支付宝接口是否可用，充值少量积分",
    trial: "先体验账户、充值和积分扣费流程",
    starter: "适合日常练习与短期备考",
    pro: "适合密集练习和长期刷题",
    unlimited: "大额储备，单次积分成本更低"
  }[id] || "选择适合你的积分包";
}

function trimAmount(amount) {
  return String(amount || "").replace(/\.00$/, "");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ===================== 兑换码功能 =====================

// 注入兑换码弹窗 + 样式 + 事件
function ensureRedeemFeature() {
  injectRedeemStyles();
  if (!document.querySelector("[data-redeem-modal]")) {
    document.body.insertAdjacentHTML("beforeend", `
      <div class="credit-modal" data-redeem-modal hidden>
        <div class="credit-modal-backdrop" data-close-redeem></div>
        <section class="credit-dialog redeem-dialog" role="dialog" aria-modal="true" aria-labelledby="redeem-title">
          <button class="credit-close" type="button" aria-label="关闭" data-close-redeem><i data-lucide="x"></i></button>
          <p class="section-kicker">兑换中心</p>
          <h2 id="redeem-title">兑换码兑换积分</h2>
          <form class="redeem-form" data-redeem-form>
            <label>兑换码
              <input name="code" type="text" placeholder="QM-XXXXXX-XXXXXX" autocomplete="off"
                spellcheck="false" maxlength="20" required />
            </label>
            <p class="redeem-hint">兑换码格式：QM-XXXXXX-XXXXXX，购买充值包后由店铺发货。</p>
            <button class="button button-primary" type="submit" data-redeem-submit><i data-lucide="ticket-check"></i>立即兑换</button>
          </form>
          <div class="redeem-result" data-redeem-result hidden>
            <div class="redeem-result-icon"><i data-lucide="party-popper"></i></div>
            <strong data-redeem-result-title>兑换成功</strong>
            <p data-redeem-result-text></p>
            <button class="button button-primary" type="button" data-redeem-done>完成</button>
          </div>
          <p class="credit-status" data-redeem-status></p>
        </section>
      </div>
    `);
  }
  bindRedeemEvents();
  window.lucide?.createIcons();
}

function injectRedeemStyles() {
  if (document.getElementById("qm-redeem-styles")) return;
  const style = document.createElement("style");
  style.id = "qm-redeem-styles";
  style.textContent = `
    .redeem-dialog { max-width: 460px; }
    .redeem-form { display: grid; gap: 12px; margin-top: 12px; }
    .redeem-form label { display: grid; gap: 6px; font-size: 14px; color: #344054; font-weight: 600; }
    .redeem-form input {
      width: 100%; border: 1.5px solid #d8e1ec; border-radius: 10px;
      padding: 12px 14px; font-size: 17px; letter-spacing: 1px;
      font-family: ui-monospace, "SF Mono", Consolas, monospace;
      text-transform: uppercase; transition: border-color .15s ease;
    }
    .redeem-form input:focus { outline: none; border-color: #2563eb; }
    .redeem-hint { margin: 0; font-size: 13px; color: #667085; }
    .redeem-result { display: grid; gap: 10px; justify-items: center; text-align: center; padding: 18px 0 6px; }
    .redeem-result-icon {
      width: 56px; height: 56px; border-radius: 50%;
      display: grid; place-items: center; background: #e8f7ef; color: #067647;
    }
    .redeem-result-icon svg { width: 28px; height: 28px; }
    .redeem-result strong { font-size: 18px; }
    .redeem-result p { margin: 0; color: #667085; font-size: 14px; }
    .redeem-entry {
      margin-top: 18px; padding: 18px 20px; border: 1.5px dashed #c3d2e8;
      border-radius: 14px; background: #f7fafc;
      display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    }
    .redeem-entry-copy { display: grid; gap: 4px; }
    .redeem-entry-copy strong { font-size: 15px; display: flex; align-items: center; gap: 8px; }
    .redeem-entry-copy strong svg { width: 18px; height: 18px; color: #2563eb; }
    .redeem-entry-copy span { font-size: 13px; color: #667085; }
  `;
  document.head.appendChild(style);
}

function bindRedeemEvents() {
  // 打开兑换弹窗
  document.querySelectorAll("[data-open-redeem]").forEach((button) => {
    button.addEventListener("click", () => openRedeemModal());
  });
  // 关闭
  document.querySelectorAll("[data-close-redeem]").forEach((button) => {
    button.addEventListener("click", closeRedeemModal);
  });
  // 完成
  document.querySelector("[data-redeem-done]")?.addEventListener("click", () => {
    closeRedeemModal();
    refreshAccountProfile().catch(() => undefined);
  });
  // 输入时清空错误
  document.querySelector("[data-redeem-form] [name='code']")?.addEventListener("input", (event) => {
    const input = event.currentTarget;
    input.value = input.value.toUpperCase().replace(/\s+/g, "");
    setRedeemStatus("");
  });
  // 提交兑换
  document.querySelector("[data-redeem-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitRedeemCode().catch((error) => setRedeemStatus(error.message || String(error), "error"));
  });
}

function openRedeemModal() {
  if (!accountState?.token) {
    openAuthModal("login");
    setAuthStatus("请先登录后再兑换积分。", "error");
    return;
  }
  const modal = document.querySelector("[data-redeem-modal]");
  if (!modal) return;
  const form = document.querySelector("[data-redeem-form]");
  const result = document.querySelector("[data-redeem-result]");
  if (form) { form.hidden = false; form.reset(); }
  if (result) result.hidden = true;
  setRedeemStatus("");
  modal.hidden = false;
  document.querySelector("[data-redeem-form] [name='code']")?.focus();
  window.lucide?.createIcons();
}

function closeRedeemModal() {
  const modal = document.querySelector("[data-redeem-modal]");
  if (modal) modal.hidden = true;
}

function setRedeemStatus(text, type = "") {
  const el = document.querySelector("[data-redeem-status]");
  if (!el) return;
  el.textContent = text || "";
  el.className = `credit-status ${type}`.trim();
}

async function submitRedeemCode() {
  const form = document.querySelector("[data-redeem-form]");
  if (!form) return;
  const code = (form.querySelector("[name='code']")?.value || "").trim().toUpperCase();
  if (!code) throw new Error("请输入兑换码。");
  if (!accountState?.token) {
    openAuthModal("login");
    throw new Error("请先登录后再兑换。");
  }
  const submitBtn = document.querySelector("[data-redeem-submit]");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "正在兑换..."; }
  try {
    const result = await creditApi("redeemCode", { accountToken: accountState.token, code });
    const formEl = document.querySelector("[data-redeem-form]");
    const resultEl = document.querySelector("[data-redeem-result]");
    const titleEl = document.querySelector("[data-redeem-result-title]");
    const textEl = document.querySelector("[data-redeem-result-text]");
    if (formEl) formEl.hidden = true;
    if (resultEl) resultEl.hidden = false;
    if (titleEl) titleEl.textContent = "兑换成功";
    if (textEl) textEl.textContent = `${result.packageName || "积分包"} 已到账 ${formatNumber(result.credits)} 积分，当前余额 ${formatNumber(result.balance)} 积分。`;
    setRedeemStatus("");
    // 更新页面上的余额显示
    if (accountState && result.balance !== undefined) {
      accountState.credits = result.balance;
      saveCreditState(accountState);
      updateAccountView();
    }
    window.lucide?.createIcons();
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `<i data-lucide="ticket-check"></i>立即兑换`; }
    window.lucide?.createIcons();
  }
}

// 自动初始化（页面含 [data-redeem-entry] 容器时启用）
if (document.querySelector("[data-redeem-entry]") || document.querySelector("[data-open-redeem]")) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureRedeemFeature);
  } else {
    ensureRedeemFeature();
  }
}
