// admin/dist/admin.js
(() => {
  const COLL = "access_codes";

  const $ = (s, r = document) => r.querySelector(s);

  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => t.classList.remove("show"), 1700);
  }

  function normCode(raw) {
    const s = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
    return s.replace(/[^A-Z0-9]/g, "");
  }

  function genCode(len = 10) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function setStatusUI(active) {
    $("#stActive")?.classList.toggle("active", !!active);
    $("#stInactive")?.classList.toggle("active", !active);
    $("#stActive").dataset.val = "1";
    $("#stInactive").dataset.val = "0";
  }

  function getStatusUI() {
    return $("#stActive")?.classList.contains("active");
  }

  function readForm() {
    const clientName = String($("#clientName").value || "").trim();
    const eventName = String($("#eventName").value || "").trim();
    const code = normCode($("#code").value);
    const active = !!getStatusUI();
    const maxUsesRaw = String($("#maxUses").value || "").trim();

    let maxUses = 9999;
    if (maxUsesRaw !== "") {
      const n = parseInt(maxUsesRaw, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 9999) maxUses = n;
    }

    return { clientName, eventName, code, active, maxUses };
  }

  function clearForm() {
    $("#clientName").value = "";
    $("#eventName").value = "";
    $("#code").value = "";
    $("#maxUses").value = "";
    setStatusUI(true);
  }

  async function saveCode() {
    if (!window.db || !window.firebase) {
      toast("Firestore belum siap. Cek firebase-config.js");
      return;
    }

    const { clientName, eventName, code, active, maxUses } = readForm();

    if (!clientName) return toast("Nama Client wajib diisi.");
    if (!eventName) return toast("Nama Wedding/Event wajib diisi.");
    if (!code || code.length < 6) return toast("Kode Unik tidak valid (min 6).");

    const ref = db.collection(COLL).doc(code);

    try {
      const now = firebase.firestore.Timestamp.now();

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
          tx.set(ref, {
            code,
            clientName,
            eventName,
            active,
            maxUses,
            usedCount: 0,
            createdAt: now,
            updatedAt: now,
            lastUsedAt: null
          });
        } else {
          const old = snap.data() || {};
          const usedCount = Number.isFinite(+old.usedCount) ? +old.usedCount : 0;

          tx.update(ref, {
            clientName,
            eventName,
            active,
            maxUses,
            usedCount, // keep
            updatedAt: now
          });
        }
      });

      toast("Kode berhasil disimpan.");
    } catch (e) {
      console.error(e);
      toast("Gagal menyimpan. Cek firebaseConfig & rules.");
    }
  }

  function renderRows(allDocs, q) {
    const tbody = $("#tbody");
    tbody.innerHTML = "";

    const query = String(q || "").trim().toLowerCase();

    const docs = allDocs.filter(d => {
      if (!query) return true;
      const hay = [
        d.code, d.clientName, d.eventName
      ].join(" ").toLowerCase();
      return hay.includes(query);
    });

    if (docs.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6" class="muted">Tidak ada data.</td>`;
      tbody.appendChild(tr);
      return;
    }

    for (const d of docs) {
      const tr = document.createElement("tr");

      const activeBadge = d.active
        ? `<span class="badge on">Aktif</span>`
        : `<span class="badge off">Nonaktif</span>`;

      const used = Number.isFinite(+d.usedCount) ? +d.usedCount : 0;
      const max = Number.isFinite(+d.maxUses) ? +d.maxUses : 9999;
      const usedText = `${used}/${max}`;

      tr.innerHTML = `
        <td class="mono"><b>${d.code}</b></td>
        <td>${escapeHtml(d.clientName)}</td>
        <td>${escapeHtml(d.eventName)}</td>
        <td>${activeBadge}</td>
        <td>${usedText}</td>
        <td class="right">
          <div class="actBtns">
            <button class="smallBtn" data-act="copy" data-code="${d.code}">Copy</button>
            <button class="smallBtn" data-act="toggle" data-code="${d.code}">${d.active ? "Nonaktif" : "Aktif"}</button>
            <button class="smallBtn danger" data-act="del" data-code="${d.code}">Delete</button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function toggleActive(code) {
    const ref = db.collection(COLL).doc(code);
    const now = firebase.firestore.Timestamp.now();

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error("Not found");
        const d = snap.data() || {};
        tx.update(ref, { active: !(d.active !== false), updatedAt: now });
      });
      toast("Status diubah.");
    } catch (e) {
      console.error(e);
      toast("Gagal ubah status.");
    }
  }

  async function deleteCode(code) {
    const ok = confirm(`Hapus kode ${code}?`);
    if (!ok) return;

    try {
      await db.collection(COLL).doc(code).delete();
      toast("Kode dihapus.");
    } catch (e) {
      console.error(e);
      toast("Gagal hapus. Cek rules (delete).");
    }
  }

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      toast("Kode disalin.");
    } catch {
      // fallback
      const t = document.createElement("textarea");
      t.value = code;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
      toast("Kode disalin.");
    }
  }

  function wireUI() {
    // default status
    setStatusUI(true);

    $("#btnGen").addEventListener("click", () => {
      $("#code").value = genCode(10);
    });

    $("#code").addEventListener("input", () => {
      $("#code").value = normCode($("#code").value);
    });

    $("#stActive").addEventListener("click", () => setStatusUI(true));
    $("#stInactive").addEventListener("click", () => setStatusUI(false));

    $("#btnClear").addEventListener("click", () => clearForm());
    $("#btnSave").addEventListener("click", () => saveCode());

    // table actions (delegation)
    $("#tbody").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      const code = btn.dataset.code;
      if (!code) return;

      if (act === "copy") copyCode(code);
      if (act === "toggle") toggleActive(code);
      if (act === "del") deleteCode(code);
    });
  }

  function startRealtime() {
    if (!window.db) {
      toast("Firestore belum siap. Cek firebase-config.js");
      return;
    }

    let cache = [];

    db.collection(COLL)
      .orderBy("createdAt", "desc")
      .onSnapshot((snap) => {
        cache = snap.docs.map(doc => doc.data());
        renderRows(cache, $("#q").value);
      }, (err) => {
        console.error(err);
        toast("Gagal load data. Cek rules read.");
      });

    $("#q").addEventListener("input", () => renderRows(cache, $("#q").value));
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireUI();
    startRealtime();
  });
})();
