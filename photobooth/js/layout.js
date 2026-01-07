/* =========================================
   STEP LOCKING (Layout -> Snap -> Edit -> Export)
========================================= */

const STEP_ORDER = ["layout", "snap", "edit", "export"];
const PROGRESS_KEY = "pb_unlocked_step_index";

function getUnlockedIndex() {
  const n = parseInt(localStorage.getItem(PROGRESS_KEY) || "0", 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(n, STEP_ORDER.length - 1)) : 0;
}

function setUnlockedIndex(idx) {
  const safe = Math.max(0, Math.min(idx, STEP_ORDER.length - 1));
  localStorage.setItem(PROGRESS_KEY, String(safe));
  return safe;
}

function unlockUntil(stepName) {
  const idx = STEP_ORDER.indexOf(stepName);
  if (idx < 0) return getUnlockedIndex();
  return setUnlockedIndex(Math.max(getUnlockedIndex(), idx));
}

function setActiveStep(stepName) {
  document.querySelectorAll(".pb-step[data-step]").forEach((el) => {
    const active = el.dataset.step === stepName;
    el.classList.toggle("pb-step-active", active);
    if (active) el.setAttribute("aria-current", "step");
    else el.removeAttribute("aria-current");
  });

  updateStepLocks();
}

function updateStepLocks() {
  const unlocked = getUnlockedIndex();

  document.querySelectorAll(".pb-step[data-step]").forEach((el) => {
    const idx = STEP_ORDER.indexOf(el.dataset.step);
    const locked = idx > unlocked;

    el.classList.toggle("pb-step-locked", locked);
    el.setAttribute("aria-disabled", locked ? "true" : "false");
    el.disabled = locked;
  });
}

function bindStepNavigation() {
  document.querySelectorAll(".pb-step[data-step]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = STEP_ORDER.indexOf(btn.dataset.step);
      if (idx > getUnlockedIndex()) {
        e.preventDefault();
        return;
      }
      const href = btn.dataset.href;
      if (href) window.location.href = href;
    });
  });
}

/* =========================================
   TEMPLATE PICKER
========================================= */

const SNAP_URL = "snapcam.html";

const RAW = {
  "Care": {
    "CareLogo": ["care.png"],
    "CareTemplate": {
      "Template 4R": {
        "Landscape": {
          "Angle Landscape": [
            "4R Landscape 1x - 01.png", "4R Landscape 1x - 02.png", "4R Landscape 1x - 03.png",
            "4R Landscape 2x - 01.png", "4R Landscape 3x - 02.png", "4R Landscape 3x - 03.png", "4R Landscape 3x - 04.png",
            "4R Landscape 4x - 01.png", "4R Landscape 4x - 02.png", "4R Landscape 4x - 03.png"
          ],
          "Angle Portrait": [
            "4R Landscape 2x - 02.png", "4R Landscape 2x - 03.png", "4R Landscape 2x - 04.png", "4R Landscape 3x - 01.png"
          ]
        },
        "Portrait": {
          "Angle Landscape": [
            "4R Portrait 2x - 01.png", "4R Portrait 2x - 02.png", "4R Portrait 2x - 03.png"
          ],
          "Angle Portrait": [
            "4R Portrait 1x - 01.png", "4R Portrait 1x - 02.png", "4R Portrait 1x - 03.png", "4R Portrait 1x - 04.png",
            "4R Portrait 4x - 01.png", "4R Portrait 4x - 02.png", "4R Portrait 6x - 01.png"
          ]
        }
      },

      "Template Photostrip": {
        "Landscape": { "Angle Landscape": ["Photostrip Landscape 2x - 01.png"] },
        "Portrait": {
          "Angle Landscape": [
            "Photostrip Landscape 3x - 01.png", "Photostrip Landscape 3x - 02.png", "Photostrip Landscape 3x - 03.png",
            "Photostrip Landscape 4x - 01.png", "Photostrip Landscape 4x - 02.png"
          ],
          "Angle Portrait": [
            "Photostrip Portrait 2x - 01.png", "Photostrip Portrait 3x - 01.png", "Photostrip Portrait 3x - 02.png"
          ]
        }
      },

      "Template Polaroid": {
        "Landscape": { "Angle Portrait": ["Polaroid Landscape 1x - 01.png"] }
      }
    }
  }
};

function walk(node, path, brand, out) {
  if (Array.isArray(node)) { node.forEach(file => out.push({ brand, path, file })); return; }
  if (node && typeof node === "object") {
    Object.entries(node).forEach(([k, v]) => walk(v, path.concat(k), brand, out));
  }
}

function pickTemplateType(file) {
  const f = file.toLowerCase();
  if (f.startsWith("4r")) return "4R";
  if (f.startsWith("photostrip")) return "Photostrip";
  if (f.startsWith("polaroid")) return "Polaroid";
  return "Unknown";
}

function pickPose(file) {
  const m = file.match(/(\d+)x/i);
  return m ? `${m[1]}x` : "(Tidak ada)";
}

function pickOrientationFromText(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("landscape")) return "Landscape";
  if (t.includes("portrait")) return "Portrait";
  return null;
}

function makeSrcCandidates(segments) {
  const raw = segments.join("/");
  const enc = segments.map(s => encodeURIComponent(String(s))).join("/");
  return [enc, raw, "./" + enc, "./" + raw];
}

function buildLibrary(raw) {
  const occ = [];
  for (const [brand, obj] of Object.entries(raw)) walk(obj, [], brand, occ);

  const items = [];
  for (const { brand, path, file } of occ) {
    if (path.some(p => String(p).toLowerCase().includes("logo"))) continue;

    const ext = (file.split(".").pop() || "").toLowerCase();
    const baseName = file.replace(/\.[^.]+$/, "");
    const jenis = pickTemplateType(file);
    const pose = pickPose(file);

    const orientPath = path.find(p => p === "Landscape" || p === "Portrait") || null;
    const orientFile = pickOrientationFromText(file);
    const orientasi = orientPath || orientFile || "(Tidak ada)";
    const angle = path.find(p => String(p).toLowerCase().startsWith("angle ")) || "(Tidak ada)";

    // ✅ FIX assets: layout.html ada di /photobooth/
    const segments = ["..", "assets", brand].concat(path).concat([file]);
    const candidates = makeSrcCandidates(segments);

    items.push({
      id: `${brand}::${path.join("/")}::${file}`,
      fileName: file,
      baseName,
      ext,
      brand,
      jenis,
      pose,
      orientasi,
      angle,
      src: candidates[0],
      srcFallbacks: candidates.slice(1)
    });
  }
  return items;
}

const LIBRARY = buildLibrary(RAW);

const FILTERS = [
  { key: "orientasi", label: "Orientasi" },
  { key: "angle", label: "Angle Kamera" },
  { key: "pose", label: "Pose" },
];

const state = {
  layout: null,
  mode: null,
  q: "",
  openKey: null,
  sortDir: "asc",
  optionQuery: Object.fromEntries(FILTERS.map(f => [f.key, ""])),
  selected: Object.fromEntries(FILTERS.map(f => [f.key, new Set()])),
  picked: [],
};

const $ = (sel, root = document) => root.querySelector(sel);

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

function selectionLimit() { return (state.mode === "mix") ? 3 : 1; }
function updatePickedUI() { $("#pickedPill").textContent = `Terpilih: ${state.picked.length}/${selectionLimit()}`; }

function resetFiltersSearchOnly() {
  state.q = ""; $("#q").value = "";
  state.openKey = null;
  for (const f of FILTERS) state.selected[f.key].clear();
  for (const f of FILTERS) state.optionQuery[f.key] = "";
}

function resetAllUI() {
  resetFiltersSearchOnly();
  state.picked = [];
  updatePickedUI();
  closeMenu();
}

function subsetMatches(it) {
  if (!state.layout) return false;
  if (state.layout === "Polaroid") return it.jenis === "Polaroid";
  if (!state.mode) return false;
  return it.jenis === state.layout;
}

function matchesSelection(it, key, selSet) {
  if (!selSet || selSet.size === 0) return true;
  return selSet.has(it[key]);
}

function queryMatches(it) {
  const q = state.q.trim().toLowerCase();
  if (!q) return true;
  const hay = [it.baseName, it.fileName, it.jenis, it.pose, it.orientasi, it.angle].join(" ").toLowerCase();
  return hay.includes(q);
}

function itemMatches(it) {
  if (!subsetMatches(it)) return false;
  if (!queryMatches(it)) return false;
  for (const f of FILTERS) {
    if (!matchesSelection(it, f.key, state.selected[f.key])) return false;
  }
  return true;
}

function getOptionsForKey(targetKey) {
  const set = new Set();
  for (const it of LIBRARY) {
    if (!subsetMatches(it)) continue;
    if (!queryMatches(it)) continue;

    let ok = true;
    for (const f of FILTERS) {
      if (f.key === targetKey) continue;
      if (!matchesSelection(it, f.key, state.selected[f.key])) { ok = false; break; }
    }
    if (!ok) continue;

    set.add(it[targetKey]);
  }
  return Array.from(set).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "id"));
}

function validateSelections() {
  for (const f of FILTERS) {
    const sel = state.selected[f.key];
    if (!sel || sel.size === 0) continue;
    const current = Array.from(sel)[0];
    const opts = getOptionsForKey(f.key);
    if (!opts.includes(current)) sel.clear();
  }
}

function formatChipValue(key) {
  const sel = state.selected[key];
  if (!sel || sel.size === 0) return "Semua";
  return Array.from(sel)[0];
}

function closeMenu() { state.openKey = null; renderChips(); }

window.__imgFallback = function (imgEl) {
  const listStr = imgEl.dataset.srcList || "";
  const list = listStr ? listStr.split("|").filter(Boolean) : [];
  const idx = parseInt(imgEl.dataset.fallbackIndex || "0", 10);

  if (idx < list.length) {
    imgEl.dataset.fallbackIndex = String(idx + 1);
    imgEl.src = list[idx];
    return;
  }
  imgEl.style.display = "none";
  const fb = imgEl.parentElement.querySelector(".fallback");
  if (fb) fb.style.display = "flex";
};

function isSingleOnlyInMix(item) {
  if (state.mode !== "mix") return false;
  if (state.layout !== "Photostrip") return false;
  return item.fileName === "Photostrip Landscape 2x - 01.png" || item.baseName === "Photostrip Landscape 2x - 01";
}

function getPickedAngleLock() {
  if (state.mode !== "mix") return null;
  if (state.layout !== "4R" && state.layout !== "Photostrip") return null;

  if (state.picked.length > 0) {
    const first = LIBRARY.find(x => x.id === state.picked[0]);
    if (!first) return null;
    if (first.angle === "Angle Landscape" || first.angle === "Angle Portrait") return first.angle;
    return null;
  }

  const sel = state.selected.angle;
  if (sel && sel.size > 0) {
    const v = Array.from(sel)[0];
    if (v === "Angle Landscape" || v === "Angle Portrait") return v;
  }
  return null;
}

function isAngleMismatch(item) {
  const lock = getPickedAngleLock();
  if (!lock) return false;
  if (item.angle !== "Angle Landscape" && item.angle !== "Angle Portrait") return false;
  return item.angle !== lock;
}

function trySelectAngleOption(opt) {
  const lock = getPickedAngleLock();
  if (!lock) return true;
  if (opt !== "Angle Landscape" && opt !== "Angle Portrait") return true;
  if (opt === lock) return true;
  toast("Tidak dapat dipilih karena berbeda Angle Kamera (Mix Layout).");
  return false;
}

function togglePick(id) {
  const limit = selectionLimit();
  const i = state.picked.indexOf(id);

  if (i >= 0) {
    state.picked.splice(i, 1);
    updatePickedUI();
    renderChips();
    renderGrid();
    return;
  }

  if (state.mode === "single") {
    state.picked = [id];
    updatePickedUI();
    renderChips();
    renderGrid();
    return;
  }

  if (state.picked.length >= limit) {
    toast(`Maksimal pilih ${limit} template untuk Mix Layout`);
    return;
  }

  state.picked.push(id);
  updatePickedUI();
  renderChips();
  renderGrid();
}

function renderChips() {
  validateSelections();
  const root = $("#chips");
  root.innerHTML = "";

  const pickedLock = getPickedAngleLock();

  for (const f of FILTERS) {
    const chip = document.createElement("div");
    chip.className = "chip";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `
      <span class="label">${f.label}</span>
      <span class="value">${formatChipValue(f.key)}</span>
      <svg class="chev" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.openKey = (state.openKey === f.key) ? null : f.key;
      renderChips();
    });
    chip.appendChild(btn);

    const menu = document.createElement("div");
    menu.className = "menu" + (state.openKey === f.key ? " open" : "");
    menu.addEventListener("click", e => e.stopPropagation());

    const allOptions = getOptionsForKey(f.key);
    const oq = (state.optionQuery[f.key] || "").toLowerCase();
    const visibleOptions = allOptions.filter(v => String(v).toLowerCase().includes(oq));

    menu.innerHTML = `
      <header><div class="title">${f.label}</div></header>
      <div class="filterSearch">
        <input type="text" placeholder="Cari opsi..." value="${state.optionQuery[f.key] || ""}">
      </div>
      <div class="options"></div>
    `;

    const optSearch = menu.querySelector(".filterSearch input");
    optSearch.addEventListener("input", () => {
      state.optionQuery[f.key] = optSearch.value;
      renderChips();
    });

    const optionsEl = menu.querySelector(".options");

    if (visibleOptions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "opt";
      empty.style.color = "var(--muted)";
      empty.textContent = "Tidak ada opsi.";
      optionsEl.appendChild(empty);
    } else {
      for (const opt of visibleOptions) {
        const row = document.createElement("div");
        const isSelected = state.selected[f.key].has(opt);

        let disabled = false;
        if (f.key === "angle" && state.mode === "mix" && pickedLock) {
          if (opt === "Angle Landscape" || opt === "Angle Portrait") {
            disabled = (opt !== pickedLock);
          }
        }

        row.className = "opt" + (isSelected ? " selected" : "") + (disabled ? " disabled" : "");
        row.innerHTML = `<span>${opt}</span>${disabled ? `
            <svg class="lock" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <rect x="6" y="11" width="12" height="10" rx="2" stroke="currentColor" stroke-width="2"/>
            </svg>
          ` : `<span style="width:16px"></span>`
          }`;

        row.addEventListener("click", () => {
          if (f.key === "angle") {
            if (!trySelectAngleOption(opt)) return;
          }

          const set = state.selected[f.key];
          if (set.has(opt)) set.clear();
          else { set.clear(); set.add(opt); }

          renderChips();
          renderGrid();
        });

        optionsEl.appendChild(row);
      }
    }

    chip.appendChild(menu);
    root.appendChild(chip);
  }
}

function cardRank(it) {
  const selected = state.picked.includes(it.id);
  const locked = (state.mode === "mix") && (isAngleMismatch(it) || isSingleOnlyInMix(it));
  if (state.mode === "mix") {
    if (selected) return 0;
    if (!locked) return 1;
    return 2;
  }
  return 1;
}

function goToSnapPhotobooth(it) {
  unlockUntil("snap");
  updateStepLocks();

  const params = new URLSearchParams({
    template: it.src,
    name: it.baseName,
    jenis: it.jenis,
    orientasi: it.orientasi,
    angle: it.angle,
    pose: it.pose
  });

  window.location.href = `${SNAP_URL}?${params.toString()}`;
}

function renderGrid() {
  validateSelections();
  const grid = $("#grid");
  grid.innerHTML = "";

  let filtered = LIBRARY.filter(itemMatches);

  filtered.sort((a, b) => {
    if (state.mode === "mix") {
      const ra = cardRank(a), rb = cardRank(b);
      if (ra !== rb) return ra - rb;
    }
    const aa = String(a.baseName).toLowerCase();
    const bb = String(b.baseName).toLowerCase();
    return state.sortDir === "asc" ? aa.localeCompare(bb, "id") : bb.localeCompare(aa, "id");
  });

  $("#count").textContent = `${filtered.length} template`;
  updatePickedUI();

  for (const it of filtered) {
    const isSel = state.picked.includes(it.id);

    const lockedBySingleOnly = (state.mode === "mix") && isSingleOnlyInMix(it);
    const lockedByAngle = (state.mode === "mix") && isAngleMismatch(it);
    const locked = lockedBySingleOnly || lockedByAngle;

    const card = document.createElement("div");
    card.className = "card" + (isSel ? " isSelected" : "") + (locked ? " locked" : "");
    card.tabIndex = 0;

    const fallbackList = it.srcFallbacks.join("|");

    card.innerHTML = `
      <div class="selectBadge" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M20 6 9 17l-5-5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <div class="thumb">
        <img
          alt="${it.baseName}"
          loading="lazy"
          src="${it.src}"
          data-src-list="${fallbackList}"
          data-fallback-index="0"
          onerror="window.__imgFallback(this)"
        >
        <div class="fallback">
          <div style="font-weight:900;">Preview tidak ditemukan</div>
          <div class="ext">${it.ext || "file"}</div>
        </div>
      </div>

      <div class="meta">
        <div class="name" title="${it.fileName}">${it.baseName}</div>
        <div class="cardActions">
          <button class="tryBtn" type="button">Try now</button>
        </div>
      </div>
    `;

    const onPick = () => {
      if (locked) {
        if (lockedBySingleOnly) toast("Template ini hanya tersedia untuk Single Layout.");
        else toast("Tidak dapat dipilih karena berbeda Angle Kamera (Mix Layout).");
        return;
      }
      togglePick(it.id);
    };

    card.addEventListener("click", onPick);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); }
    });

    card.querySelector(".tryBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      if (locked) {
        if (lockedBySingleOnly) toast("Template ini hanya tersedia untuk Single Layout.");
        else toast("Tidak dapat dipilih karena berbeda Angle Kamera (Mix Layout).");
        return;
      }
      goToSnapPhotobooth(it);
    });

    grid.appendChild(card);
  }

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.style.padding = "16px";
    empty.style.color = "var(--muted)";
    empty.textContent = "Tidak ada template yang cocok.";
    grid.appendChild(empty);
  }
}

function highlightPickCards() {
  document.querySelectorAll('.pickCards .pickCard').forEach(el => {
    el.classList.toggle("selected", el.dataset.layout === state.layout);
  });
  document.querySelectorAll('#modeWrap .pickCard').forEach(el => {
    el.classList.toggle("selected", el.dataset.mode === state.mode);
  });
}

function showApp() {
  $("#app").style.display = "block";
  $("#resetLayout").style.display = "inline-block";
  renderChips();
  renderGrid();
}

function hideApp() { $("#app").style.display = "none"; }

function setLayout(layout) {
  state.layout = layout;
  state.mode = null;
  resetAllUI();

  if (layout === "Polaroid") {
    state.mode = "single";
    $("#modeWrap").style.display = "none";
    highlightPickCards();
    showApp();
    return;
  }

  $("#modeWrap").style.display = "block";
  hideApp();
  highlightPickCards();
}

function setMode(mode) {
  if (state.layout !== "4R" && state.layout !== "Photostrip") return;

  state.mode = mode;
  const limit = selectionLimit();
  if (state.picked.length > limit) state.picked = state.picked.slice(0, limit);

  resetFiltersSearchOnly();
  closeMenu();
  highlightPickCards();
  showApp();
  updatePickedUI();
}

document.addEventListener("DOMContentLoaded", () => {
  setActiveStep("layout");
  updateStepLocks();
  bindStepNavigation();

  document.querySelectorAll(".pickCards .pickCard").forEach(card => {
    const handler = () => setLayout(card.dataset.layout);
    card.addEventListener("click", handler);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
    });
  });

  document.querySelectorAll("#modeWrap .pickCard").forEach(card => {
    const handler = () => setMode(card.dataset.mode);
    card.addEventListener("click", handler);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
    });
  });

  $("#resetLayout").addEventListener("click", () => {
    state.layout = null;
    state.mode = null;
    resetAllUI();
    $("#app").style.display = "none";
    $("#modeWrap").style.display = "none";
    $("#resetLayout").style.display = "none";
    document.querySelectorAll(".pickCard").forEach(el => el.classList.remove("selected"));
  });

  $("#q").addEventListener("input", (e) => {
    state.q = e.target.value;
    renderChips();
    renderGrid();
  });

  $("#sortBtn").addEventListener("click", () => {
    state.sortDir = (state.sortDir === "asc") ? "desc" : "asc";
    $("#sortLabel").textContent = (state.sortDir === "asc") ? "A–Z" : "Z–A";
    renderGrid();
  });

  $("#clearAll").addEventListener("click", () => {
    resetAllUI();
    renderChips();
    renderGrid();
  });

  document.addEventListener("click", () => closeMenu());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  resetAllUI();
  $("#app").style.display = "none";
  $("#modeWrap").style.display = "none";
  $("#resetLayout").style.display = "none";
});
