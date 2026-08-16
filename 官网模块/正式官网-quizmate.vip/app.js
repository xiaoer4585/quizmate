const header = document.querySelector("[data-header]");
const menuButton = document.querySelector("[data-menu-button]");
const mobileNav = document.querySelector("[data-mobile-nav]");
const toast = document.querySelector("[data-toast]");
const platformMessage = document.querySelector("[data-platform-message]");
const VISIT_API_ENDPOINT = "https://api.quizmate.vip/study-auth-api";

function trackWebsiteVisit() {
  if (window.__quizmateVisitTracked) return;
  window.__quizmateVisitTracked = true;
  void fetch(VISIT_API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "trackWebsiteVisit", pagePath: window.location.pathname || "/" }),
    keepalive: true
  }).catch((error) => {
    console.debug("访问量统计上报未完成。", error);
  });
}

const platformLabels = {
  android: "检测到安卓设备，已为你标记安卓客户端。",
  ios: "iPhone 客户端正在开发中，已保留在下载列表最后。",
  windows: "检测到 Windows 设备，已为你标记 Windows 客户端。",
  macos: "检测到 Mac 设备，已为你标记 Mac 客户端。",
  desktop: "请选择 Windows、Mac 或安卓客户端；iPhone 版本正在开发中。"
};

function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("android")) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (ua.includes("macintosh") || ua.includes("mac os x")) return "macos";
  if (ua.includes("windows")) return "windows";
  return "desktop";
}

function recommendPlatform() {
  const platform = detectPlatform();
  const card = document.querySelector(`[data-platform-card="${platform}"]`);
  if (card) card.classList.add("recommended");
  if (platformMessage) platformMessage.textContent = platformLabels[platform];
}

function setMenu(open) {
  menuButton?.setAttribute("aria-expanded", String(open));
  menuButton?.setAttribute("aria-label", open ? "关闭导航菜单" : "打开导航菜单");
  mobileNav?.classList.toggle("open", open);
  document.body.classList.toggle("menu-open", open);

  const icon = menuButton?.querySelector("svg");
  if (icon && window.lucide) {
    icon.outerHTML = `<i data-lucide="${open ? "x" : "menu"}" aria-hidden="true"></i>`;
    window.lucide.createIcons();
  }
}

menuButton?.addEventListener("click", () => {
  setMenu(menuButton.getAttribute("aria-expanded") !== "true");
});

mobileNav?.querySelectorAll("a, button").forEach((item) => {
  item.addEventListener("click", () => setMenu(false));
});

window.addEventListener(
  "scroll",
  () => {
    header?.classList.toggle("scrolled", window.scrollY > 12);
  },
  { passive: true }
);

let toastTimer = null;
const DOWNLOAD_PRODUCT_MAP = {
  "android-client": "quizmate-android",
  "mac-client": "quizmate-mac",
  "mac-client-arm64": "quizmate-mac",
  "mac-client-x64": "quizmate-mac",
  "windows-client": "quizmate-windows"
};
document.querySelectorAll("[data-download]").forEach((link) => {
  link.addEventListener("click", () => {
    const key = link.dataset.download;
    const product = DOWNLOAD_PRODUCT_MAP[key];
    if (product) {
      void fetch(VISIT_API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trackDownload", product, userAgent: navigator.userAgent.slice(0, 500) }),
        keepalive: true
      }).catch((error) => { console.debug("下载量统计上报未完成。", error); });
    }
    if (!toast) return;
    const label = {
      "android-client": "安卓客户端下载已开始",
      "mac-client": "Mac 客户端下载已开始",
      "mac-client-arm64": "Mac Apple 芯片版下载已开始",
      "mac-client-x64": "Mac Intel 芯片版下载已开始",
      "manual-android": "安卓操作手册下载已开始",
      "manual-mac": "Mac 操作手册下载已开始",
      "manual-windows": "Windows 操作手册下载已开始",
      "windows-client": "Windows 客户端下载已开始"
    }[key];

    toast.querySelector("span").textContent = label || "文件下载已开始";
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
  });
});

// Mac 客户端合并下拉选择
(function initMacDropdown() {
  const dropdowns = document.querySelectorAll("[data-mac-dropdown]");
  if (!dropdowns.length) return;

  function setOpen(dropdown, open) {
    if (!dropdown) return;
    dropdown.dataset.open = open ? "true" : "false";
    dropdown.querySelector("[data-mac-dropdown-trigger]")?.setAttribute("aria-expanded", String(open));
  }

  dropdowns.forEach((dropdown) => {
    const trigger = dropdown.querySelector("[data-mac-dropdown-trigger]");
    trigger?.addEventListener("click", (event) => {
      event.preventDefault();
      const willOpen = dropdown.dataset.open !== "true";
      dropdowns.forEach((other) => setOpen(other, false));
      setOpen(dropdown, willOpen);
    });

    // 点击下拉项后启动下载并关闭菜单
    dropdown.querySelectorAll("[data-mac-dropdown-menu] a").forEach((link) => {
      link.addEventListener("click", () => setOpen(dropdown, false));
    });
  });

  // 点击外部或按 Esc 关闭
  document.addEventListener("click", (event) => {
    dropdowns.forEach((dropdown) => {
      if (!dropdown.contains(event.target)) setOpen(dropdown, false);
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") dropdowns.forEach((dropdown) => setOpen(dropdown, false));
  });
})();

trackWebsiteVisit();
recommendPlatform();
window.lucide?.createIcons();

function initReviewsCarousel() {
  const carousel = document.querySelector("[data-reviews-carousel]");
  if (!carousel) return;

  const track = carousel.querySelector("[data-reviews-track]");
  const indicatorsContainer = carousel.querySelector("[data-reviews-indicators]");
  if (!track || !indicatorsContainer) return;

  const originalSlides = Array.from(track.children);
  if (originalSlides.length === 0) return;

  let currentIndex = 0;
  let autoplayTimer;
  let resizeTimer;

  function getVisibleCount() {
    return window.matchMedia("(max-width: 768px)").matches ? 1 : 4;
  }

  function getSlideStep() {
    const style = window.getComputedStyle(track);
    const gap = Number.parseFloat(style.columnGap || style.gap || "0") || 0;
    return originalSlides[0].getBoundingClientRect().width + gap;
  }

  function updateIndicators() {
    const activeIndex = currentIndex % originalSlides.length;
    indicatorsContainer.querySelectorAll(".reviews-dot").forEach((indicator, index) => {
      indicator.classList.toggle("active", index === activeIndex);
    });
  }

  function moveTo(index, animated = true) {
    currentIndex = index;
    track.style.transition = animated ? "transform 0.42s ease" : "none";
    track.style.transform = `translateX(-${currentIndex * getSlideStep()}px)`;
    updateIndicators();
  }

  function createIndicators() {
    indicatorsContainer.innerHTML = "";
    originalSlides.forEach((_, index) => {
      const dot = document.createElement("span");
      dot.className = `reviews-dot${index === 0 ? " active" : ""}`;
      indicatorsContainer.appendChild(dot);
    });
  }

  function setupClones() {
    track.querySelectorAll("[data-review-clone]").forEach((clone) => clone.remove());
    originalSlides.slice(0, getVisibleCount()).forEach((slide) => {
      const clone = slide.cloneNode(true);
      clone.setAttribute("data-review-clone", "true");
      track.appendChild(clone);
    });
    createIndicators();
    moveTo(0, false);
  }

  function startAutoplay() {
    clearInterval(autoplayTimer);
    autoplayTimer = setInterval(() => {
      moveTo(currentIndex + 1);
      if (currentIndex >= originalSlides.length) {
        window.setTimeout(() => moveTo(0, false), 430);
      }
    }, 800);
  }

  setupClones();
  startAutoplay();

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      setupClones();
      startAutoplay();
    }, 160);
  });
}

initReviewsCarousel();
