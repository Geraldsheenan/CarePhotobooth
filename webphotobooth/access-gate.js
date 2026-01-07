// WEBPHOTOBOOTH/webphotobooth/access_gate.js

(function () {
  console.log("[AccessGate] loaded ✅");

  const firebaseConfig = {
    apiKey: "AIzaSyBPZIHbdd4vScmu_jD9zhwKohEdBVpov2o",
    authDomain: "photoboothweb-3e626.firebaseapp.com",
    projectId: "photoboothweb-3e626",
    storageBucket: "photoboothweb-3e626.firebasestorage.app",
    messagingSenderId: "730123959054",
    appId: "1:730123959054:web:f10616f23308f3957b755f",
    measurementId: "G-DDD8LXN16Q"
  };

  const STORAGE_CODE = "pb_access_code";
  const STORAGE_EXPIRES = "pb_access_expires";
  const STORAGE_META = "pb_access_meta";
  const SESSION_HOURS = 12;

  let _db = null;

  function ensureFirebase() {
    if (!window.firebase) throw new Error("Firebase belum ter-load.");
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
    if (!_db) _db = firebase.firestore();
    return _db;
  }

  function nowMs() { return Date.now(); }

  function isUnlocked() {
    const exp = parseInt(localStorage.getItem(STORAGE_EXPIRES) || "0", 10);
    return exp > nowMs() && !!localStorage.getItem(STORAGE_CODE);
  }

  function setUnlocked(code, meta) {
    const exp = nowMs() + SESSION_HOURS * 60 * 60 * 1000;
    localStorage.setItem(STORAGE_CODE, code);
    localStorage.setItem(STORAGE_EXPIRES, String(exp));
    localStorage.setItem(STORAGE_META, JSON.stringify(meta || {}));
  }

  function clearUnlocked() {
    localStorage.removeItem(STORAGE_CODE);
    localStorage.removeItem(STORAGE_EXPIRES);
    localStorage.removeItem(STORAGE_META);
  }

  async function validateAndConsume(code) {
    const db = ensureFirebase();
    const clean = (code || "").trim().toUpperCase();

    if (!/^[A-Z0-9]{6,16}$/.test(clean)) {
      throw new Error("Format kode tidak valid. Gunakan huruf & angka (6–16 karakter).");
    }

    const ref = db.collection("access_codes").doc(clean);

    const meta = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Kode tidak ditemukan.");

      const d = snap.data() || {};
      const active = !!d.active;
      const usedCount = Number.isFinite(d.usedCount) ? d.usedCount : 0;
      const maxUses = Number.isFinite(d.maxUses) ? d.maxUses : 9999;

      if (!active) throw new Error("Kode nonaktif.");
      if (usedCount >= maxUses) throw new Error("Kode sudah mencapai batas pemakaian.");

      tx.update(ref, {
        usedCount: firebase.firestore.FieldValue.increment(1),
        lastUsedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      return {
        code: clean,
        clientName: d.clientName || "",
        eventName: d.eventName || "",
        maxUses,
        usedCountAfter: usedCount + 1,
      };
    });

    return meta;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  function injectStyles() {
    if (document.getElementById("access-gate-style")) return;
    const s = document.createElement("style");
    s.id = "access-gate-style";
    s.textContent = `
      .is-locked{ opacity:.55; cursor:not-allowed; }
      .gate-wrap{ position:fixed; inset:0; display:none; z-index:9999; }
      .gate-wrap.open{ display:block; }
      .gate-backdrop{ position:absolute; inset:0; background:rgba(0,0,0,.35); }
      .gate-card{
        position:relative;
        width:min(420px, calc(100% - 32px));
        margin:10vh auto 0;
        background:#fff;
        border-radius:16px;
        box-shadow:0 20px 60px rgba(0,0,0,.18);
        padding:18px;
        font-family:"Open Sans",system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      }
      .gate-head{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .gate-title{ margin:0; font-size:18px; font-weight:700; }
      .gate-x{ border:0; background:transparent; font-size:22px; line-height:1; cursor:pointer; padding:6px 10px; }
      .gate-sub{ margin:8px 0 14px; color:#555; font-size:13px; }
      .gate-label{ display:block; font-size:12px; color:#444; margin-bottom:6px; font-weight:600; }
      .gate-input{
        width:100%;
        padding:12px 12px;
        border-radius:12px;
        border:1px solid #e5e5e5;
        font-size:14px;
        letter-spacing:1px;
        text-transform:uppercase;
        outline:none;
      }
      .gate-input:focus{ border-color:#111; }
      .gate-error{
        margin-top:10px;
        color:#b00020;
        background:#fff1f1;
        border:1px solid #ffd1d1;
        padding:10px 12px;
        border-radius:12px;
        font-size:13px;
        display:none;
      }
      .gate-actions{ display:flex; gap:10px; margin-top:14px; }
      .gate-btn{
        flex:1;
        padding:12px 12px;
        border-radius:999px;
        border:1px solid #e5e5e5;
        background:#fff;
        cursor:pointer;
        font-weight:700;
      }
      .gate-btn.primary{ background:#111; border-color:#111; color:#fff; }
      .gate-btn:disabled{ opacity:.6; cursor:not-allowed; }
      .gate-meta{ margin-top:12px; font-size:12px; color:#666; display:none; }
      .gate-row{ display:flex; justify-content:space-between; gap:12px; margin-top:6px; }
      .gate-row b{ color:#111; }
      .gate-foot{ margin-top:14px; display:flex; justify-content:space-between; align-items:center; gap:12px; }
      .gate-link{ border:0; background:transparent; color:#111; text-decoration:underline; cursor:pointer; font-weight:700; padding:0; }
    `;
    document.head.appendChild(s);
  }

  function ensureModal() {
    injectStyles();
    let wrap = document.getElementById("accessGate");
    if (wrap) return wrap;

    wrap = document.createElement("div");
    wrap.id = "accessGate";
    wrap.className = "gate-wrap";
    wrap.innerHTML = `
      <div class="gate-backdrop" data-close="1"></div>
      <div class="gate-card" role="dialog" aria-modal="true" aria-labelledby="gateTitle">
        <div class="gate-head">
          <h3 class="gate-title" id="gateTitle">Masukkan Kode Akses</h3>
          <button class="gate-x" type="button" data-close="1" aria-label="Tutup">×</button>
        </div>
        <p class="gate-sub">Masukkan kode unik dari admin untuk membuka menu Photobooth.</p>

        <label class="gate-label" for="gateCode">Kode</label>
        <input class="gate-input" id="gateCode" placeholder="CONTOH: 4R474KHB9B" autocomplete="off" />

        <div class="gate-error" id="gateError"></div>

        <div class="gate-actions">
          <button class="gate-btn" type="button" id="gateClear">Clear</button>
          <button class="gate-btn primary" type="button" id="gateSubmit">Submit</button>
        </div>

        <div class="gate-meta" id="gateMeta"></div>

        <div class="gate-foot">
          <button class="gate-link" type="button" id="gateLogout" style="display:none;">Keluar kode</button>
          <span style="font-size:12px;color:#777;">Care Photobooth</span>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.querySelectorAll("[data-close='1']").forEach((el) => {
      el.addEventListener("click", closeModal);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && wrap.classList.contains("open")) closeModal();
    });

    wrap.querySelector("#gateClear").addEventListener("click", () => {
      const input = wrap.querySelector("#gateCode");
      const err = wrap.querySelector("#gateError");
      const meta = wrap.querySelector("#gateMeta");
      input.value = "";
      err.style.display = "none";
      err.textContent = "";
      meta.style.display = "none";
      meta.textContent = "";
      input.focus();
    });

    wrap.querySelector("#gateSubmit").addEventListener("click", async () => {
      const input = wrap.querySelector("#gateCode");
      const err = wrap.querySelector("#gateError");
      const btn = wrap.querySelector("#gateSubmit");
      const metaBox = wrap.querySelector("#gateMeta");

      err.style.display = "none";
      err.textContent = "";
      metaBox.style.display = "none";
      metaBox.textContent = "";

      const code = (input.value || "").trim().toUpperCase();
      input.value = code;

      btn.disabled = true;
      btn.textContent = "Memproses...";

      try {
        const meta = await validateAndConsume(code);
        setUnlocked(code, meta);
        refreshLockState();

        metaBox.style.display = "block";
        metaBox.innerHTML = `
          <div class="gate-row"><span>Client</span> <b>${escapeHtml(meta.clientName || "-")}</b></div>
          <div class="gate-row"><span>Event</span> <b>${escapeHtml(meta.eventName || "-")}</b></div>
          <div class="gate-row"><span>Used</span> <b>${meta.usedCountAfter}/${meta.maxUses}</b></div>
        `;

        setTimeout(closeModal, 650);
      } catch (e) {
        err.style.display = "block";
        err.textContent = e?.message || "Gagal memvalidasi kode.";
      } finally {
        btn.disabled = false;
        btn.textContent = "Submit";
      }
    });

    wrap.querySelector("#gateLogout").addEventListener("click", () => {
      clearUnlocked();
      refreshLockState();
      closeModal();
    });

    return wrap;
  }

  function openModal() {
    const wrap = ensureModal();
    wrap.classList.add("open");

    const input = wrap.querySelector("#gateCode");
    const err = wrap.querySelector("#gateError");
    const metaBox = wrap.querySelector("#gateMeta");
    const logoutBtn = wrap.querySelector("#gateLogout");

    err.style.display = "none";
    err.textContent = "";

    if (isUnlocked()) {
      let meta = {};
      try { meta = JSON.parse(localStorage.getItem(STORAGE_META) || "{}"); } catch {}

      metaBox.style.display = "block";
      metaBox.innerHTML = `
        <div class="gate-row"><span>Client</span> <b>${escapeHtml(meta.clientName || "-")}</b></div>
        <div class="gate-row"><span>Event</span> <b>${escapeHtml(meta.eventName || "-")}</b></div>
        <div class="gate-row"><span>Kode</span> <b>${escapeHtml(localStorage.getItem(STORAGE_CODE) || "-")}</b></div>
      `;
      logoutBtn.style.display = "inline";
    } else {
      metaBox.style.display = "none";
      metaBox.textContent = "";
      logoutBtn.style.display = "none";
    }

    setTimeout(() => input.focus(), 0);
  }

  function closeModal() {
    const wrap = document.getElementById("accessGate");
    if (wrap) wrap.classList.remove("open");
  }

  function applyLockToLink(a, locked) {
    if (!a) return;
    if (!a.dataset.realHref) a.dataset.realHref = a.getAttribute("href") || "";

    a.classList.toggle("is-locked", locked);
    a.setAttribute("aria-disabled", locked ? "true" : "false");
    a.setAttribute("href", locked ? "#" : a.dataset.realHref);
  }

  function refreshLockState() {
    const locked = !isUnlocked();

    document.querySelectorAll('[data-gate="booth"]').forEach((a) => {
      applyLockToLink(a, locked);
    });

    const btn = document.getElementById("accessBtn");
    if (btn) btn.textContent = locked ? "Masuk" : "Kode Aktif";
  }

  // ✅ AUTO-BIND: event delegation (tidak peduli header di-load kapan)
  document.addEventListener("click", (e) => {
    const accessBtn = e.target.closest("#accessBtn");
    if (accessBtn) {
      e.preventDefault();
      openModal();
      return;
    }

    const boothLink = e.target.closest('[data-gate="booth"]');
    if (boothLink && !isUnlocked()) {
      e.preventDefault();
      openModal();
    }
  });

  // ✅ kalau user langsung buka /photobooth/* tanpa unlock, balikin ke home
  function enforceDirectAccessGuard() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("/photobooth/") && !isUnlocked()) {
      window.location.replace("/webphotobooth/index.html");
    }
  }

  // ✅ observer: kalau header/footer baru masuk, langsung refresh lock state
  const mo = new MutationObserver(() => refreshLockState());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  window.AccessGate = {
    open: openModal,
    refreshLockState,
    isUnlocked,
    clearUnlocked,
    enforceDirectAccessGuard,
  };

  // initial
  refreshLockState();
  enforceDirectAccessGuard();
})();
