// WEBPHOTOBOOTH/webphotobooth/main.js

async function loadComponentFromAny(urlCandidates, placeholderId) {
  const el = document.getElementById(placeholderId);
  for (const url of urlCandidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;

      const html = await res.text();
      if (el) el.innerHTML = html;
      return true;
    } catch (e) {
      // coba kandidat berikutnya
    }
  }

  console.error("Gagal memuat komponen dari kandidat:", urlCandidates);
  if (el) el.innerHTML = `<p style="color:red; text-align:center;">Gagal memuat komponen.</p>`;
  return false;
}

function initializeApp() {
  const headerEl = document.querySelector(".header");
  const menuBtn = document.getElementById("menuBtn");
  const mobilePanel = document.getElementById("mobilePanel");
  const logoLink = document.getElementById("logoLink");

  function setExpanded(isOpen) {
    if (!menuBtn || !mobilePanel) return;
    menuBtn.setAttribute("aria-expanded", String(isOpen));
    mobilePanel.classList.toggle("open", isOpen);
  }

  menuBtn?.addEventListener("click", () => {
    const isOpen = mobilePanel?.classList.contains("open");
    setExpanded(!isOpen);
  });

  mobilePanel?.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a) setExpanded(false);
  });

  logoLink?.addEventListener("click", () => setExpanded(false));

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) setExpanded(false);
  });

  function updateHeaderOnScroll() {
    if (!headerEl) return;
    headerEl.classList.toggle("is-transparent", (window.scrollY || 0) > 10);
  }
  window.addEventListener("scroll", updateHeaderOnScroll, { passive: true });

  // ✅ ACTIVE NAV
  function setActiveNav() {
    const path = window.location.pathname.toLowerCase();
    const isPhotobooth = path.includes("/photobooth/");
    const currentFile = (path.split("/").pop() || "").toLowerCase();

    document.querySelectorAll("[data-nav]").forEach((link) => {
      const navKey = link.getAttribute("data-nav");

      if (navKey === "booth") {
        link.classList.toggle("active", isPhotobooth);
        if (isPhotobooth) link.setAttribute("href", window.location.pathname);
      } else {
        const href = (link.getAttribute("href") || "").split("/").pop().toLowerCase();
        link.classList.toggle("active", href === currentFile);
      }
    });
  }

  // year di footer
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  updateHeaderOnScroll();
  setActiveNav();

  // ✅ Gate UI setelah header ke-load
  window.AccessGate?.bindUI?.();
  window.AccessGate?.refreshLockState?.();
}

document.addEventListener("DOMContentLoaded", async () => {
  const pathname = window.location.pathname.toLowerCase();
  const shouldHideFooter = pathname.includes("/photobooth/");

  const v = Date.now();

  // kandidat path (biar aman)
  const headerCandidates = [
    `/partials/_header.html?v=${v}`,
    `../partials/_header.html?v=${v}`,
    `./partials/_header.html?v=${v}`,
  ];
  const footerCandidates = [
    `/partials/_footer.html?v=${v}`,
    `../partials/_footer.html?v=${v}`,
    `./partials/_footer.html?v=${v}`,
  ];

  // Pastikan header placeholder ada
  if (!document.getElementById("header-placeholder")) {
    const header = document.createElement("header");
    header.id = "header-placeholder";
    header.className = "header";
    document.body.prepend(header);
  }

  // Footer placeholder hanya dibuat kalau tidak di-hide
  if (shouldHideFooter) {
    document.getElementById("footer-placeholder")?.remove();
  } else {
    if (!document.getElementById("footer-placeholder")) {
      const footer = document.createElement("footer");
      footer.id = "footer-placeholder";
      footer.className = "footer";
      document.body.appendChild(footer);
    }
  }

  await loadComponentFromAny(headerCandidates, "header-placeholder");

  if (!shouldHideFooter) {
    await loadComponentFromAny(footerCandidates, "footer-placeholder");
  }

  initializeApp();
});
