(function initXiaohongshuReward() {
  const openButtons = document.querySelectorAll("[data-open-xhs-reward]");
  if (!openButtons.length) return;

  const ACCOUNT_STORAGE_KEY = "quizmate_credit_account";
  const REVIEW_STORAGE_KEY = "quizmate_xhs_reward_reviews_v1";
  const postTitle = "同学们，发现打破秋招内卷的“魔法”神器";
  const pinnedComment = [
    "恭喜同学你找到了打败秋招的“魔法”～",
    "关注官方小红📕：搜索quizmate，找到ai头像的官方账号",
    "主页传送门👉 ⓠⓤⓘⓩⓜⓐⓣⓔ.ⓒⓝ",
    "不切屏不截屏，悬浮隐藏窗口字幕，支持双机位语音播报模式，结合简历+JD AI辅助笔试面试，考前熟悉和练习"
  ].join("\n");

  document.body.insertAdjacentHTML("beforeend", `
    <div class="credit-modal xhs-reward-modal" data-xhs-reward-modal hidden>
      <div class="credit-modal-backdrop" data-close-xhs-reward></div>
      <section class="credit-dialog xhs-reward-dialog" role="dialog" aria-modal="true" aria-labelledby="xhs-modal-title">
        <button class="credit-close" type="button" aria-label="关闭" data-close-xhs-reward><i data-lucide="x"></i></button>
        <div class="xhs-reward-dialog-head">
          <span class="xhs-reward-dialog-mark"><i data-lucide="heart"></i></span>
          <div>
            <p class="section-kicker">9月限时小红书集赞福利</p>
            <h2 id="xhs-modal-title">提交笔记，审核通过自动发积分</h2>
            <p>点赞或收藏任一项达到对应档位即可申请。客服核验通过后，奖励积分自动发放到当前登录账号。</p>
          </div>
        </div>

        <div class="xhs-reward-ladder">
          <article>
            <span class="xhs-reward-ladder-count">20 <small>赞/收藏</small></span>
            <div><strong>笔试实战包</strong><p>任一项达到 20，奖励 600 积分</p></div>
            <i data-lucide="package-check"></i>
          </article>
          <span class="xhs-reward-ladder-line" aria-hidden="true"></span>
          <article class="is-premium">
            <span class="xhs-reward-ladder-count">70 <small>赞/收藏</small></span>
            <div><strong>笔试上岸包</strong><p>达到 70 赞/收藏，奖励 2500 积分</p></div>
            <i data-lucide="sparkles"></i>
          </article>
        </div>

        <ol class="xhs-reward-steps">
          <li><span>1</span><p><strong>发布笔记</strong>使用下方标题、置顶评论和配图</p></li>
          <li><span>2</span><p><strong>集满赞/收藏</strong>任一项达到 20 或 70</p></li>
          <li><span>3</span><p><strong>提交审核</strong>填写数据并上传个人中心截图</p></li>
        </ol>

        <section class="xhs-share-kit" aria-labelledby="xhs-share-kit-title">
          <div class="xhs-share-kit-head">
            <div>
              <p class="section-kicker">发布素材</p>
              <h3 id="xhs-share-kit-title">小红书文案与配图</h3>
            </div>
          </div>
          <div class="xhs-copy-blocks">
            <article class="xhs-copy-block">
              <div class="xhs-copy-block-head"><span>小红书文案</span><button class="xhs-copy-button" type="button" data-copy-xhs="title"><i data-lucide="copy"></i>复制文案</button></div>
              <p><strong>${postTitle}</strong></p>
            </article>
            <article class="xhs-copy-block">
              <div class="xhs-copy-block-head"><span>置顶评论</span><button class="xhs-copy-button" type="button" data-copy-xhs="comment"><i data-lucide="copy"></i>复制评论</button></div>
              <p>${pinnedComment.replaceAll("\n", "<br />")}</p>
            </article>
          </div>
          <div class="xhs-share-images">
            <figure>
              <img src="assets/xiaohongshu-written-test.png" alt="QuizMate 笔试悬浮答题界面配图" loading="lazy" decoding="async" />
              <figcaption><span>笔试场景</span><a class="xhs-asset-download" href="assets/xiaohongshu-written-test.png" download="QuizMate-笔试场景.png"><i data-lucide="download"></i>下载</a></figcaption>
            </figure>
            <figure>
              <img src="assets/xiaohongshu-interview.avif" alt="QuizMate 面试辅助界面配图" loading="lazy" decoding="async" />
              <figcaption><span>面试场景</span><a class="xhs-asset-download" href="assets/xiaohongshu-interview.avif" download="QuizMate-面试场景.avif"><i data-lucide="download"></i>下载</a></figcaption>
            </figure>
          </div>
          <p class="xhs-copy-status" data-xhs-copy-status aria-live="polite"></p>
        </section>

        <section class="xhs-submit-section" aria-labelledby="xhs-submit-title">
          <div class="xhs-submit-heading">
            <div><p class="section-kicker">兑换申请</p><h3 id="xhs-submit-title">提交兑换信息</h3></div>
            <div class="xhs-current-account" data-xhs-account-wrap>
              <i data-lucide="circle-user-round"></i>
              <span><small>积分发放账号</small><strong data-xhs-current-account>尚未登录</strong></span>
              <button type="button" data-xhs-login>去登录</button>
            </div>
          </div>

          <form class="xhs-reward-form" data-xhs-reward-form novalidate>
            <label>
              <span>小红书笔记链接</span>
              <input name="noteUrl" type="url" inputmode="url" placeholder="https://www.xiaohongshu.com/..." autocomplete="url" required />
            </label>
            <div class="xhs-reward-form-row">
              <label><span>当前点赞数</span><input name="likeCount" type="number" inputmode="numeric" min="0" step="1" value="0" required /></label>
              <label><span>当前收藏数</span><input name="favoriteCount" type="number" inputmode="numeric" min="0" step="1" value="0" required /></label>
            </div>
            <div class="xhs-tier-preview" data-xhs-tier-preview>
              <i data-lucide="gauge"></i><span>填写点赞数和收藏数后查看可申请档位</span>
            </div>
            <label class="xhs-proof-field">
              <span>笔记归属截图</span>
              <span class="xhs-proof-tip"><i data-lucide="info"></i>请在个人中心截图该笔记，确保该笔记是本人。</span>
              <span class="xhs-proof-dropzone" data-xhs-proof-dropzone>
                <input name="proof" type="file" accept="image/png,image/jpeg,image/webp,image/avif" required />
                <i data-lucide="image-up"></i>
                <strong>选择截图</strong>
                <small>支持 PNG、JPG、WebP、AVIF，原型中仅保存在当前浏览器</small>
              </span>
            </label>
            <div class="xhs-proof-preview" data-xhs-proof-preview hidden>
              <img alt="待提交的笔记归属截图预览" data-xhs-proof-image />
              <div><strong data-xhs-proof-name></strong><span>截图已就绪</span></div>
              <button type="button" aria-label="移除截图" title="移除截图" data-remove-xhs-proof><i data-lucide="trash-2"></i></button>
            </div>
            <p class="xhs-reward-form-status" data-xhs-reward-status aria-live="polite"></p>
            <button class="xhs-reward-submit" type="submit"><i data-lucide="send"></i><span>提交兑换信息</span></button>
          </form>
        </section>

        <section class="xhs-review-history" aria-labelledby="xhs-history-title">
          <div class="xhs-history-head"><div><p class="section-kicker">申请记录</p><h3 id="xhs-history-title">兑换审核情况</h3></div><button type="button" class="xhs-history-refresh" data-xhs-refresh title="刷新记录" aria-label="刷新审核记录"><i data-lucide="refresh-cw"></i></button></div>
          <div data-xhs-review-history></div>
        </section>

        <p class="xhs-reward-rule"><i data-lucide="shield-check"></i>同一篇笔记、同一 QuizMate 账号每档限兑一次；内容须真实可见。当前为页面审核原型，积分发放为本地模拟，正式上线后以服务端审核结果为准。</p>
      </section>
    </div>
  `);

  const modal = document.querySelector("[data-xhs-reward-modal]");
  const form = modal.querySelector("[data-xhs-reward-form]");
  const status = modal.querySelector("[data-xhs-reward-status]");
  const copyStatus = modal.querySelector("[data-xhs-copy-status]");
  const accountLabel = modal.querySelector("[data-xhs-current-account]");
  const accountWrap = modal.querySelector("[data-xhs-account-wrap]");
  const loginButton = modal.querySelector("[data-xhs-login]");
  const proofInput = form.elements.proof;
  const proofPreview = modal.querySelector("[data-xhs-proof-preview]");
  const proofImage = modal.querySelector("[data-xhs-proof-image]");
  const proofName = modal.querySelector("[data-xhs-proof-name]");
  const tierPreview = modal.querySelector("[data-xhs-tier-preview]");
  const history = modal.querySelector("[data-xhs-review-history]");
  let proofDataUrl = "";
  let trigger = null;

  function getAccountState() {
    try { return JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY) || "null"); }
    catch { return null; }
  }

  function getCurrentAccount() {
    const state = getAccountState();
    return state?.token && state?.account?.email ? state.account : null;
  }

  function readReviews() {
    try {
      const value = JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) || "[]");
      if (!Array.isArray(value)) return [];
      let changed = false;
      const migrated = value.map((item) => {
        if (Number(item?.tier) !== 80) return item;
        changed = true;
        return { ...item, tier: 70, rewardCredits: 2500 };
      });
      if (changed) localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch { return []; }
  }

  function saveReviews(reviews) {
    localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviews));
  }

  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  function setStatus(message, type = "") {
    status.textContent = message;
    status.className = `xhs-reward-form-status${type ? ` ${type}` : ""}`;
  }

  function setCopyStatus(message, type = "") {
    copyStatus.textContent = message;
    copyStatus.className = `xhs-copy-status${type ? ` ${type}` : ""}`;
  }

  function requestLogin(message = "请先登录 QuizMate 账号，再提交兑换信息。") {
    if (typeof window.openAuthModal === "function") window.openAuthModal("login");
    if (typeof window.setAuthStatus === "function") window.setAuthStatus(message, "error");
  }

  function updateAccount() {
    const account = getCurrentAccount();
    accountLabel.textContent = account?.email || "尚未登录";
    accountWrap.classList.toggle("is-logged-in", Boolean(account));
    loginButton.hidden = Boolean(account);
    renderHistory();
  }

  function openModal(event) {
    trigger = event.currentTarget;
    modal.hidden = false;
    document.body.classList.add("xhs-reward-modal-open");
    updateAccount();
    updateTierPreview();
    window.lucide?.createIcons();
    window.setTimeout(() => modal.querySelector("[name='noteUrl']")?.focus(), 0);
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("xhs-reward-modal-open");
    setStatus("");
    trigger?.focus();
  }

  function isXiaohongshuUrl(value) {
    try {
      const host = new URL(value).hostname.toLowerCase();
      return host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com") || host === "xhslink.com" || host.endsWith(".xhslink.com");
    } catch { return false; }
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "") || "/"}`;
    } catch { return value.trim().toLowerCase(); }
  }

  function getTier(likes, favorites) {
    const count = Math.max(likes, favorites);
    if (count >= 70) return { tier: 70, rewardCredits: 2500, label: "70赞/收藏 · 笔试上岸包" };
    if (count >= 20) return { tier: 20, rewardCredits: 600, label: "20赞/收藏 · 笔试实战包" };
    return { tier: 0, rewardCredits: 0, label: "尚未达到 20赞/收藏" };
  }

  function updateTierPreview() {
    const likes = Number(form.elements.likeCount.value || 0);
    const favorites = Number(form.elements.favoriteCount.value || 0);
    const result = getTier(likes, favorites);
    tierPreview.className = `xhs-tier-preview${result.tier ? ` tier-${result.tier}` : ""}`;
    tierPreview.innerHTML = result.tier
      ? `<i data-lucide="badge-check"></i><span>预计申请 <strong>${result.label}</strong>，审核通过奖励 <strong>${result.rewardCredits.toLocaleString("zh-CN")} 积分</strong></span>`
      : `<i data-lucide="gauge"></i><span>${result.label}，还差 ${Math.max(0, 20 - Math.max(likes, favorites))} 个赞或收藏</span>`;
    window.lucide?.createIcons();
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    if (!fallbackCopy(text)) throw new Error("复制失败");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(file);
    });
  }

  async function compressProof(file) {
    const source = await fileToDataUrl(file);
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("无法识别该图片，请换用 PNG 或 JPG。"));
      image.src = source;
    });
    const maxSize = 1280;
    const ratio = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  }

  function clearProof() {
    proofInput.value = "";
    proofDataUrl = "";
    proofImage.removeAttribute("src");
    proofName.textContent = "";
    proofPreview.hidden = true;
  }

  async function handleProofChange() {
    const file = proofInput.files?.[0];
    if (!file) return clearProof();
    if (!file.type.startsWith("image/")) {
      clearProof();
      setStatus("请上传图片格式的截图。", "error");
      return;
    }
    setStatus("正在处理截图...");
    try {
      proofDataUrl = await compressProof(file);
      proofImage.src = proofDataUrl;
      proofName.textContent = file.name;
      proofPreview.hidden = false;
      setStatus("");
    } catch (error) {
      clearProof();
      setStatus(error.message || "截图处理失败，请重试。", "error");
    }
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
  }

  function renderHistory() {
    const account = getCurrentAccount();
    if (!account) {
      history.innerHTML = `<div class="xhs-history-empty"><i data-lucide="lock-keyhole"></i><p>登录后查看当前账号的兑换审核情况。</p></div>`;
      window.lucide?.createIcons();
      return;
    }
    const items = readReviews().filter((item) => item.accountEmail === account.email).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
    if (!items.length) {
      history.innerHTML = `<div class="xhs-history-empty"><i data-lucide="inbox"></i><p>当前账号暂无兑换申请。</p></div>`;
      window.lucide?.createIcons();
      return;
    }
    const statusMap = {
      pending: ["待审核", "clock-3"],
      approved: ["审核通过", "circle-check-big"],
      rejected: ["未通过", "circle-x"]
    };
    history.innerHTML = `<div class="xhs-history-list">${items.map((item) => {
      const mapped = statusMap[item.status] || statusMap.pending;
      const result = item.status === "approved"
        ? `<p class="xhs-history-result success">已发放 <strong>${Number(item.rewardCredits || 0).toLocaleString("zh-CN")} 积分</strong>（原型模拟）</p>`
        : item.status === "rejected"
          ? `<p class="xhs-history-result error">未通过原因：${escapeHtml(item.rejectReason || "未填写")}</p>`
          : `<p class="xhs-history-result">客服审核后将在这里显示结果。</p>`;
      return `<article class="xhs-history-item status-${escapeHtml(item.status || "pending")}">
        <div class="xhs-history-item-top"><span class="xhs-status-badge"><i data-lucide="${mapped[1]}"></i>${mapped[0]}</span><time>${formatTime(item.submittedAt)}</time></div>
        <a href="${escapeHtml(item.noteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.noteUrl)}</a>
        <div class="xhs-history-meta"><span>${Number(item.likeCount || 0)} 赞</span><span>${Number(item.favoriteCount || 0)} 收藏</span><strong>${Number(item.tier || 0)}赞/收藏档</strong></div>
        ${result}
      </article>`;
    }).join("")}</div>`;
    window.lucide?.createIcons();
  }

  openButtons.forEach((button) => button.addEventListener("click", openModal));
  modal.querySelectorAll("[data-close-xhs-reward]").forEach((button) => button.addEventListener("click", closeModal));
  modal.querySelectorAll("[data-copy-xhs]").forEach((button) => button.addEventListener("click", async () => {
    const type = button.dataset.copyXhs;
    try {
      await copyText(type === "title" ? postTitle : pinnedComment);
      setCopyStatus(type === "title" ? "小红书文案已复制。" : "置顶评论已复制。", "success");
    } catch { setCopyStatus("浏览器未能自动复制，请手动选择文案。", "error"); }
  }));
  loginButton.addEventListener("click", () => requestLogin());
  modal.querySelector("[data-remove-xhs-proof]").addEventListener("click", clearProof);
  modal.querySelector("[data-xhs-refresh]").addEventListener("click", () => { updateAccount(); setStatus("审核记录已刷新。", "success"); });
  proofInput.addEventListener("change", handleProofChange);
  form.elements.likeCount.addEventListener("input", updateTierPreview);
  form.elements.favoriteCount.addEventListener("input", updateTierPreview);
  form.addEventListener("input", (event) => { if (!event.target.matches("[type='number']")) setStatus(""); });
  modal.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
  window.addEventListener("storage", (event) => { if ([ACCOUNT_STORAGE_KEY, REVIEW_STORAGE_KEY].includes(event.key)) updateAccount(); });
  window.addEventListener("focus", updateAccount);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const account = getCurrentAccount();
    if (!account) {
      setStatus("请先登录，奖励将发放到当前登录账号。", "error");
      requestLogin("请先登录，再提交小红书兑换信息。登录后无需填写账号。");
      return;
    }
    const noteUrl = String(form.elements.noteUrl.value || "").trim();
    const likeCount = Number(form.elements.likeCount.value);
    const favoriteCount = Number(form.elements.favoriteCount.value);
    if (!isXiaohongshuUrl(noteUrl)) {
      setStatus("请输入有效的小红书笔记链接。", "error");
      form.elements.noteUrl.focus();
      return;
    }

    const reviews = readReviews();
    const normalizedUrl = normalizeUrl(noteUrl);
    const accountAlreadyApproved = reviews.some((item) => item.accountEmail === account.email && item.status === "approved");
    if (accountAlreadyApproved) {
      setStatus("您的账号已经提交兑换，优惠只享受一次哦~", "error");
      return;
    }
    const noteAlreadyApproved = reviews.some((item) => (item.normalizedUrl || normalizeUrl(item.noteUrl)) === normalizedUrl && item.status === "approved");
    if (noteAlreadyApproved) {
      setStatus("您提交的小红书笔记链接已经提交兑换，优惠只享受一次哦~", "error");
      return;
    }
    const accountAlreadyPending = reviews.some((item) => item.accountEmail === account.email && item.status === "pending");
    if (accountAlreadyPending) {
      setStatus("您的账号已有待审核申请，请勿重复提交。", "error");
      return;
    }
    const noteAlreadyPending = reviews.some((item) => (item.normalizedUrl || normalizeUrl(item.noteUrl)) === normalizedUrl && item.status === "pending");
    if (noteAlreadyPending) {
      setStatus("您提交的小红书笔记已有待审核申请，请勿重复提交。", "error");
      return;
    }

    if (!Number.isInteger(likeCount) || likeCount < 0 || !Number.isInteger(favoriteCount) || favoriteCount < 0) {
      setStatus("点赞数和收藏数需填写大于等于 0 的整数。", "error");
      return;
    }
    const tier = getTier(likeCount, favoriteCount);
    if (!tier.tier) {
      setStatus("点赞数或收藏数任一项满 20 后即可申请兑换。", "error");
      return;
    }
    if (!proofDataUrl) {
      setStatus("请上传个人中心的笔记截图，证明该笔记为本人发布。", "error");
      proofInput.focus();
      return;
    }

    reviews.push({
      id: `xhs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      accountEmail: account.email,
      noteUrl,
      normalizedUrl,
      likeCount,
      favoriteCount,
      tier: tier.tier,
      rewardCredits: tier.rewardCredits,
      proofDataUrl,
      proofName: proofInput.files?.[0]?.name || "笔记归属截图.jpg",
      status: "pending",
      rejectReason: "",
      submittedAt: new Date().toISOString(),
      reviewedAt: ""
    });
    try {
      saveReviews(reviews);
    } catch {
      setStatus("截图数据较大，浏览器无法保存。请上传尺寸更小的截图后重试。", "error");
      return;
    }
    form.reset();
    form.elements.likeCount.value = "0";
    form.elements.favoriteCount.value = "0";
    clearProof();
    updateTierPreview();
    renderHistory();
    setStatus("兑换信息已提交，审核结果会显示在下方记录中。", "success");
  });

  window.XhsRewardStore = { key: REVIEW_STORAGE_KEY, readReviews, saveReviews, normalizeUrl, getTier };
  window.lucide?.createIcons();
})();
