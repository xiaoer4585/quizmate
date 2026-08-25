(function initXiaohongshuAdminReview() {
  const STORAGE_KEY = "quizmate_xhs_reward_reviews_v1";
  const roots = Array.from(document.querySelectorAll("[data-xhs-admin-review]"));
  if (!roots.length) return;

  function readReviews() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(value)) return [];
      let changed = false;
      const migrated = value.map((item) => {
        if (Number(item?.tier) !== 80) return item;
        changed = true;
        return { ...item, tier: 70, rewardCredits: 2500 };
      });
      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch { return []; }
  }

  function saveReviews(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "") || "/"}`;
    } catch { return String(value || "").trim().toLowerCase(); }
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
  }

  function rewardForTier(tier) {
    return Number(tier) >= 70 ? 2500 : 600;
  }

  function seedDemoData() {
    if (document.body.dataset.demoSeed !== "true") return;
    const now = Date.now();
    const demos = [
      {
        id: "xhs_demo_pending_70", accountEmail: "lin@quizmate.cn",
        noteUrl: "https://www.xiaohongshu.com/explore/66c801",
        normalizedUrl: "www.xiaohongshu.com/explore/66c801",
        likeCount: 96, favoriteCount: 43, tier: 70, rewardCredits: 2500,
        proofDataUrl: "../assets/xiaohongshu-written-test.png", proofName: "个人中心-笔记截图.png",
        status: "pending", rejectReason: "", submittedAt: new Date(now - 18 * 60 * 1000).toISOString(), reviewedAt: ""
      },
      {
        id: "xhs_demo_approved", accountEmail: "chen@quizmate.cn",
        noteUrl: "https://www.xiaohongshu.com/explore/66c802?share_from_user_hidden=true",
        normalizedUrl: "www.xiaohongshu.com/explore/66c802",
        likeCount: 31, favoriteCount: 22, tier: 20, rewardCredits: 600,
        proofDataUrl: "../assets/xiaohongshu-interview.avif", proofName: "小红书个人中心.avif",
        status: "approved", rejectReason: "", submittedAt: new Date(now - 30 * 60 * 60 * 1000).toISOString(), reviewedAt: new Date(now - 26 * 60 * 60 * 1000).toISOString(), simulatedGrant: true
      },
      {
        id: "xhs_demo_duplicate", accountEmail: "zhou@quizmate.cn",
        noteUrl: "http://www.xiaohongshu.com/explore/66c802?xsec_token=duplicate",
        normalizedUrl: "www.xiaohongshu.com/explore/66c802",
        likeCount: 26, favoriteCount: 37, tier: 20, rewardCredits: 600,
        proofDataUrl: "../assets/xiaohongshu-written-test.png", proofName: "我的笔记.png",
        status: "pending", rejectReason: "", submittedAt: new Date(now - 52 * 60 * 1000).toISOString(), reviewedAt: ""
      },
      {
        id: "xhs_demo_rejected", accountEmail: "wu@quizmate.cn",
        noteUrl: "https://www.xiaohongshu.com/explore/66c803",
        normalizedUrl: "www.xiaohongshu.com/explore/66c803",
        likeCount: 24, favoriteCount: 9, tier: 20, rewardCredits: 600,
        proofDataUrl: "../assets/xiaohongshu-interview.avif", proofName: "笔记截图.avif",
        status: "rejected", rejectReason: "截图中未显示当前账号主页，请补充个人中心完整截图。", submittedAt: new Date(now - 50 * 60 * 60 * 1000).toISOString(), reviewedAt: new Date(now - 48 * 60 * 60 * 1000).toISOString()
      }
    ];
    const existing = readReviews();
    const existingIds = new Set(existing.map((item) => item.id));
    const missingDemos = demos.filter((item) => !existingIds.has(item.id));
    if (missingDemos.length) saveReviews([...existing, ...missingDemos]);
  }

  function getApprovedDuplicate(item, items) {
    const normalized = item.normalizedUrl || normalizeUrl(item.noteUrl);
    return items.find((candidate) => candidate.id !== item.id && candidate.status === "approved" && (candidate.normalizedUrl || normalizeUrl(candidate.noteUrl)) === normalized) || null;
  }

  const controllers = roots.map((root) => {
    const elements = {
      metrics: root.querySelector("[data-xhs-admin-metrics]"),
      list: root.querySelector("[data-xhs-admin-list]"),
      statusFilter: root.querySelector("[data-xhs-filter-status]"),
      tierFilter: root.querySelector("[data-xhs-filter-tier]"),
      queryFilter: root.querySelector("[data-xhs-filter-query]"),
      modal: root.querySelector("[data-xhs-review-modal]"),
      modalTitle: root.querySelector("[data-xhs-review-title]"),
      detail: root.querySelector("[data-xhs-review-detail]")
    };
    let activeId = "";

    function filteredItems(items) {
      const status = elements.statusFilter?.value || "all";
      const tier = elements.tierFilter?.value || "all";
      const query = (elements.queryFilter?.value || "").trim().toLowerCase();
      return items.filter((item) => {
        if (status !== "all" && item.status !== status) return false;
        if (tier !== "all" && String(item.tier) !== tier) return false;
        if (query && !`${item.accountEmail} ${item.noteUrl}`.toLowerCase().includes(query)) return false;
        return true;
      }).sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (b.status === "pending" && a.status !== "pending") return 1;
        return String(b.submittedAt).localeCompare(String(a.submittedAt));
      });
    }

    function renderMetrics(items) {
      const duplicateCount = items.filter((item) => item.status === "pending" && getApprovedDuplicate(item, items)).length;
      const metrics = [
        ["pending", "待审核", items.filter((item) => item.status === "pending").length],
        ["approved", "审核通过", items.filter((item) => item.status === "approved").length],
        ["rejected", "未通过", items.filter((item) => item.status === "rejected").length],
        ["duplicate", "重复链接风险", duplicateCount]
      ];
      elements.metrics.innerHTML = metrics.map(([type, label, value]) => `<article class="xhs-admin-metric ${type}"><span>${label}</span><strong>${value}</strong></article>`).join("");
    }

    function renderList(items) {
      const visible = filteredItems(items);
      if (!visible.length) {
        elements.list.innerHTML = `<tr><td class="xhs-admin-empty-row" colspan="8">当前筛选条件下暂无兑换申请</td></tr>`;
        return;
      }
      const statusMap = {
        pending: ["待审核", "clock-3"], approved: ["审核通过", "circle-check-big"], rejected: ["未通过", "circle-x"]
      };
      elements.list.innerHTML = visible.map((item) => {
        const duplicate = getApprovedDuplicate(item, items);
        const status = statusMap[item.status] || statusMap.pending;
        const tier = Number(item.tier || 20);
        const proof = item.proofDataUrl
          ? `<button class="xhs-admin-proof" type="button" data-xhs-open-review="${escapeHtml(item.id)}" title="查看归属截图"><img src="${escapeHtml(item.proofDataUrl)}" alt="${escapeHtml(item.proofName || "归属截图")}" /></button>`
          : `<span class="xhs-admin-risk none">未上传</span>`;
        const risk = duplicate
          ? `<span class="xhs-admin-risk"><i data-lucide="copy-check"></i>与已通过链接相同</span>`
          : `<span class="xhs-admin-risk none"><i data-lucide="shield-check"></i>暂未发现</span>`;
        const actions = item.status === "pending"
          ? `<div class="xhs-admin-row-actions"><button type="button" class="secondary" data-xhs-open-review="${escapeHtml(item.id)}"><i data-lucide="scan-search"></i>审核</button><button type="button" class="approve" data-xhs-approve="${escapeHtml(item.id)}"><i data-lucide="check"></i>通过</button></div>`
          : `<div class="xhs-admin-row-actions"><button type="button" class="secondary" data-xhs-open-review="${escapeHtml(item.id)}"><i data-lucide="eye"></i>详情</button></div>`;
        return `<tr>
          <td><div class="xhs-admin-account"><strong>${escapeHtml(item.accountEmail)}</strong><small>${escapeHtml(item.id)}</small></div></td>
          <td><div class="xhs-admin-note"><a href="${escapeHtml(item.noteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.noteUrl)}</a><div class="xhs-admin-counts"><span>${Number(item.likeCount || 0)} 赞</span><span>${Number(item.favoriteCount || 0)} 收藏</span></div></div></td>
          <td><div class="xhs-admin-tier"><span class="xhs-admin-tier-badge tier-${tier}">${tier}赞/收藏</span><small>${Number(item.rewardCredits || rewardForTier(tier)).toLocaleString("zh-CN")} 积分</small></div></td>
          <td>${proof}</td><td>${risk}</td>
          <td><span class="xhs-admin-status ${escapeHtml(item.status)}"><i data-lucide="${status[1]}"></i>${status[0]}</span></td>
          <td>${formatTime(item.submittedAt)}</td><td>${actions}</td>
        </tr>`;
      }).join("");
    }

    function render() {
      const items = readReviews();
      renderMetrics(items);
      renderList(items);
      window.lucide?.createIcons();
    }

    function closeModal() {
      elements.modal.hidden = true;
      activeId = "";
    }

    function openReview(id) {
      const items = readReviews();
      const item = items.find((candidate) => candidate.id === id);
      if (!item) return;
      activeId = id;
      const duplicate = getApprovedDuplicate(item, items);
      elements.modalTitle.textContent = item.accountEmail;
      const risk = duplicate
        ? `<div class="xhs-review-risk-box"><i data-lucide="triangle-alert"></i><span>该链接与已审核通过的申请相同。已通过用户：<strong>${escapeHtml(duplicate.accountEmail)}</strong>，通过时间：${formatTime(duplicate.reviewedAt)}。请二次核验截图和笔记归属后再决定。</span></div>`
        : "";
      const result = item.status === "pending"
        ? `<div class="xhs-review-form"><label>拒绝原因（选择拒绝时必填）</label><textarea class="xhs-review-reject-reason" data-xhs-reject-reason placeholder="例如：截图中未显示当前账号个人中心，请补充完整截图。"></textarea><div class="xhs-review-actions"><button type="button" class="reject" data-xhs-reject="${escapeHtml(item.id)}"><i data-lucide="x"></i>拒绝申请</button><button type="button" class="approve" data-xhs-approve="${escapeHtml(item.id)}"><i data-lucide="check"></i>通过并发放 ${Number(item.rewardCredits || rewardForTier(item.tier)).toLocaleString("zh-CN")} 积分</button></div></div>`
        : `<div class="xhs-review-current-result">${item.status === "approved" ? `已于 ${formatTime(item.reviewedAt)} 审核通过并模拟发放 ${Number(item.rewardCredits || 0).toLocaleString("zh-CN")} 积分。` : `已于 ${formatTime(item.reviewedAt)} 拒绝。原因：${escapeHtml(item.rejectReason || "未填写")}`}</div>`;
      elements.detail.innerHTML = `<div class="xhs-review-detail">${risk}<div class="xhs-review-summary"><div><span>用户账号</span><strong>${escapeHtml(item.accountEmail)}</strong></div><div><span>点赞 / 收藏</span><strong>${Number(item.likeCount || 0)} / ${Number(item.favoriteCount || 0)}</strong></div><div><span>奖励档位</span><strong>${Number(item.tier || 20)}赞/收藏 · ${Number(item.rewardCredits || rewardForTier(item.tier)).toLocaleString("zh-CN")} 积分</strong></div></div><figure class="xhs-review-proof-large"><figcaption><span>个人中心笔记截图</span><a href="${escapeHtml(item.noteUrl)}" target="_blank" rel="noopener noreferrer">打开小红书笔记</a></figcaption>${item.proofDataUrl ? `<img src="${escapeHtml(item.proofDataUrl)}" alt="${escapeHtml(item.proofName || "笔记归属截图")}" />` : `<div class="xhs-review-current-result">该申请没有上传归属截图。</div>`}</figure>${result}</div>`;
      elements.modal.hidden = false;
      window.lucide?.createIcons();
    }

    function approve(id) {
      const items = readReviews();
      const item = items.find((candidate) => candidate.id === id);
      if (!item || item.status !== "pending") return;
      const approvedAccount = items.find((candidate) => candidate.id !== item.id && candidate.status === "approved" && candidate.accountEmail === item.accountEmail);
      if (approvedAccount) {
        window.alert(`该账号已经有审核通过的兑换申请（${formatTime(approvedAccount.reviewedAt)}），每个用户只能领取一次。`);
        return;
      }
      const duplicate = getApprovedDuplicate(item, items);
      const message = duplicate
        ? `该链接与 ${duplicate.accountEmail} 已通过的链接相同。确认已完成二次核验并继续发放吗？`
        : `确认通过该申请，并为 ${item.accountEmail} 发放 ${Number(item.rewardCredits || rewardForTier(item.tier)).toLocaleString("zh-CN")} 积分吗？`;
      if (!window.confirm(message)) return;
      item.status = "approved";
      item.rewardCredits = Number(item.rewardCredits || rewardForTier(item.tier));
      item.reviewedAt = new Date().toISOString();
      item.rejectReason = "";
      item.simulatedGrant = true;
      saveReviews(items);
      closeModal();
      render();
    }

    function reject(id) {
      const items = readReviews();
      const item = items.find((candidate) => candidate.id === id);
      if (!item || item.status !== "pending") return;
      const reason = elements.detail.querySelector("[data-xhs-reject-reason]")?.value.trim() || "";
      if (!reason) {
        window.alert("请填写未通过原因，用户会在兑换记录中看到该原因。");
        elements.detail.querySelector("[data-xhs-reject-reason]")?.focus();
        return;
      }
      item.status = "rejected";
      item.rejectReason = reason;
      item.reviewedAt = new Date().toISOString();
      saveReviews(items);
      closeModal();
      render();
    }

    root.querySelector("[data-xhs-admin-refresh]")?.addEventListener("click", render);
    [elements.statusFilter, elements.tierFilter].forEach((element) => element?.addEventListener("change", render));
    elements.queryFilter?.addEventListener("input", render);
    elements.list.addEventListener("click", (event) => {
      const openButton = event.target.closest("[data-xhs-open-review]");
      const approveButton = event.target.closest("[data-xhs-approve]");
      if (openButton) openReview(openButton.dataset.xhsOpenReview);
      else if (approveButton) approve(approveButton.dataset.xhsApprove);
    });
    elements.modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-xhs-review]")) closeModal();
      const approveButton = event.target.closest("[data-xhs-approve]");
      const rejectButton = event.target.closest("[data-xhs-reject]");
      if (approveButton) approve(approveButton.dataset.xhsApprove);
      if (rejectButton) reject(rejectButton.dataset.xhsReject);
    });
    root.addEventListener("keydown", (event) => { if (event.key === "Escape" && activeId) closeModal(); });
    window.addEventListener("storage", (event) => { if (event.key === STORAGE_KEY) render(); });

    return { render, openReview };
  });

  seedDemoData();
  const api = {
    render() { controllers.forEach((controller) => controller.render()); },
    readReviews,
    saveReviews
  };
  window.XhsAdminReview = api;
  api.render();
})();
