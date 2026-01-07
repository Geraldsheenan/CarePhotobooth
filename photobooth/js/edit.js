/* =========================================
   EDIT PAGE
   - Load state dari sessionStorage pb_flow_state
   - Render template+foto ke canvas sesuai ukuran:
     portrait: 2400x3600
     landscape: 3600x2400
   - Tint template (frame) via source-atop
   - Text draggable via overlay DOM (textLayer)
   - Save hasil ke sessionStorage untuk export
========================================= */

const FLOW_KEY = "pb_flow_state";
const EDIT_RESULT_KEY = "pb_edit_result"; // dataURL final untuk export
const EDIT_CFG_KEY = "pb_edit_config";    // simpan config tint/text

const $ = (sel, root = document) => root.querySelector(sel);

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

function safeParseJSON(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function normHex(v) {
  let s = String(v || "").trim();
  if (!s) return "#000000";
  if (!s.startsWith("#")) s = "#" + s;
  s = s.toUpperCase();
  // normalize 3-digit -> 6-digit
  if (/^#[0-9A-F]{3}$/.test(s)) {
    s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  if (!/^#[0-9A-F]{6}$/.test(s)) return "#000000";
  return s;
}

function loadState() {
  const raw = sessionStorage.getItem(FLOW_KEY);
  const st = raw ? safeParseJSON(raw) : null;
  return st || null;
}

function saveConfig(cfg) {
  sessionStorage.setItem(EDIT_CFG_KEY, JSON.stringify(cfg));
}

function loadConfig() {
  const raw = sessionStorage.getItem(EDIT_CFG_KEY);
  const cfg = raw ? safeParseJSON(raw) : null;
  return cfg && typeof cfg === "object" ? cfg : null;
}

/* =========================================
   IMAGE HELPERS
========================================= */

function loadImageAsync(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;

  const targetR = dw / dh;
  const srcR = iw / ih;

  let sx = 0, sy = 0, sw = iw, sh = ih;

  if (srcR > targetR) {
    sw = Math.round(ih * targetR);
    sx = Math.round((iw - sw) / 2);
  } else {
    sh = Math.round(iw / targetR);
    sy = Math.round((ih - sh) / 2);
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/* =========================================
   SLOT DETECTION (transparan)
========================================= */

function detectTransparentSlots(tplImg, wantCount = 12) {
  const iw = tplImg.naturalWidth || tplImg.width;
  const ih = tplImg.naturalHeight || tplImg.height;
  if (!iw || !ih) return [];

  const maxDim = 700;
  const scale = Math.min(1, maxDim / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(tplImg, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const isHole = (i) => data[i + 3] < 8;
  const visited = new Uint8Array(w * h);

  const slots = [];
  const minArea = Math.round(w * h * 0.008);

  const idx = (x, y) => y * w + x;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = idx(x, y);
      if (visited[p]) continue;

      const di = p * 4;
      if (!isHole(di)) {
        visited[p] = 1;
        continue;
      }

      const qx = [x];
      const qy = [y];
      visited[p] = 1;

      let minX = x, maxX = x, minY = y, maxY = y;
      let area = 0;

      while (qx.length) {
        const cx = qx.pop();
        const cy = qy.pop();
        area++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const nb = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];

        for (const [nx, ny] of nb) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = idx(nx, ny);
          if (visited[np]) continue;

          const ndi = np * 4;
          if (!isHole(ndi)) {
            visited[np] = 1;
            continue;
          }

          visited[np] = 1;
          qx.push(nx);
          qy.push(ny);
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;

      if (area >= minArea && bw > 30 && bh > 30) {
        slots.push({ x: minX, y: minY, w: bw, h: bh, area });
      }
    }
  }

  slots.sort((a, b) => b.area - a.area);

  const picked = slots.slice(0, wantCount).map((s) => ({
    x: Math.round(s.x / scale),
    y: Math.round(s.y / scale),
    w: Math.round(s.w / scale),
    h: Math.round(s.h / scale),
  }));

  // sort row-major by default
  picked.sort((a, b) => a.y - b.y || a.x - b.x);
  return picked;
}

/* =========================================
   PHOTOSTRIP / POLAROID rules (sama konsep snap)
========================================= */

function normName(s) {
  return String(s || "").trim().toLowerCase();
}
function isPolaroidLandscape1x01(state) {
  return normName(state.name) === "polaroid landscape 1x - 01";
}
function isPhotostripTemplate(state) {
  return normName(state.name).includes("photostrip");
}

/** cluster center points into groups (columns/rows) */
function clusterCenters(values, threshold) {
  const sorted = [...values].sort((a, b) => a - b);
  const groups = [];
  for (const v of sorted) {
    const g = groups[groups.length - 1];
    if (!g) groups.push({ sum: v, n: 1, center: v });
    else if (Math.abs(v - g.center) <= threshold) {
      g.sum += v;
      g.n += 1;
      g.center = g.sum / g.n;
    } else {
      groups.push({ sum: v, n: 1, center: v });
    }
  }
  return groups.map((g) => g.center).sort((a, b) => a - b);
}

function buildGridMap(slots) {
  if (!slots.length) return { cols: [], rows: [], map: [] };

  const avgW = slots.reduce((s, a) => s + a.w, 0) / slots.length;
  const avgH = slots.reduce((s, a) => s + a.h, 0) / slots.length;

  const cxs = slots.map((s) => s.x + s.w / 2);
  const cys = slots.map((s) => s.y + s.h / 2);

  const colCenters = clusterCenters(cxs, Math.max(12, avgW * 0.45));
  const rowCenters = clusterCenters(cys, Math.max(12, avgH * 0.45));

  const map = Array.from({ length: colCenters.length }, () =>
    Array.from({ length: rowCenters.length }, () => null)
  );

  const nearestIndex = (centers, v) => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const d = Math.abs(centers[i] - v);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  };

  for (const s of slots) {
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const ci = nearestIndex(colCenters, cx);
    const ri = nearestIndex(rowCenters, cy);
    map[ci][ri] = s;
  }

  return { cols: colCenters, rows: rowCenters, map };
}

function decidePhotostripAxis(state, grid) {
  const name = normName(state.name);
  const perStrip = Math.max(1, state.poseCount || 1);

  const C = grid.cols.length;
  const R = grid.rows.length;

  // prioritas dari grid yang "jelas"
  if (R !== C) {
    if (R === perStrip) return "rows"; // pose top->bottom, copies left->right
    if (C === perStrip) return "cols"; // pose left->right, copies top->bottom
    return R > C ? "rows" : "cols";
  }

  // kalau square (mis. 2x2) pakai nama template
  if (name.includes("portrait")) return "rows";
  if (name.includes("landscape")) return "cols";

  return "rows";
}

/* =========================================
   EDIT RENDER ENGINE
========================================= */

let __tplCache = { src: "", img: null, slots: [] };
let __renderToken = 0;

// Text objects stored in TARGET pixels (2400/3600 based)
let textItems = [];
let selectedTextId = null;

// config UI
const cfgDefault = {
  tintEnable: true,
  tintHex: "#000000",
  tintOpacity: 100,
  txtFont: "Open Sans",
  txtSize: 56,
  txtHex: "#FFFFFF",
  txtBold: true
};

function getStageScale(canvas) {
  // scale CSS px -> target px mapping
  const cssW = canvas.clientWidth || 1;
  return cssW / (canvas.width || 1);
}

function updateDataPanel(state, cfg) {
  $("#dTemplate").textContent = state?.name || "-";
  $("#dJenis").textContent = state?.jenis || "-";
  $("#dOrientasi").textContent = state?.orientasi || state?.targetOrientation || "-";

  $("#dTintHex").textContent = normHex(cfg.tintHex);
  $("#dTintOpacity").textContent = `${Math.round(cfg.tintOpacity)}%`;

  $("#dFont").textContent = cfg.txtFont || "Open Sans";
  $("#dFontSize").textContent = `${Math.round(cfg.txtSize)}px`;
  $("#dFontHex").textContent = normHex(cfg.txtHex);
}

function syncHexPair(colorEl, hexEl) {
  const c = normHex(colorEl.value);
  colorEl.value = c;
  hexEl.value = c;
}
function syncHexFromText(colorEl, hexEl) {
  const c = normHex(hexEl.value);
  hexEl.value = c;
  colorEl.value = c;
}

function applyTextStyleToEl(el, item) {
  el.style.fontFamily = item.font;
  el.style.fontSize = `${item.size}px`;
  el.style.fontWeight = item.bold ? "800" : "600";
  el.style.color = item.color;
}

function renderTextLayer(canvas) {
  const layer = $("#textLayer");
  if (!layer) return;
  layer.innerHTML = "";

  const scale = getStageScale(canvas);

  for (const item of textItems) {
    const d = document.createElement("div");
    d.className = "txtItem" + (item.id === selectedTextId ? " selected" : "");
    d.dataset.id = item.id;
    d.textContent = item.text || "";

    // style (preview: pakai CSS px, tapi ukuran font harus ikut scaling)
    applyTextStyleToEl(d, {
      ...item,
      size: Math.max(10, Math.round(item.size * scale))
    });

    // position convert to CSS px
    d.style.left = `${item.x * scale}px`;
    d.style.top = `${item.y * scale}px`;

    // drag
    d.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectedTextId = item.id;
      renderTextLayer(canvas);
      bindDrag(e, canvas, item.id);
    });

    layer.appendChild(d);
  }
}

function bindDrag(downEvent, canvas, id) {
  const item = textItems.find(t => t.id === id);
  if (!item) return;

  const scale = getStageScale(canvas);
  const startX = downEvent.clientX;
  const startY = downEvent.clientY;

  const startItemX = item.x;
  const startItemY = item.y;

  const onMove = (ev) => {
    const dx = (ev.clientX - startX) / scale;
    const dy = (ev.clientY - startY) / scale;

    item.x = Math.max(0, Math.min(canvas.width - 10, startItemX + dx));
    item.y = Math.max(0, Math.min(canvas.height - 10, startItemY + dy));

    renderTextLayer(canvas);
    persistEditConfig();
    updateDataPanel(window.__pbState, getCurrentCfg());
  };

  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function getCurrentCfg() {
  return {
    tintEnable: !!$("#tintEnable").checked,
    tintHex: normHex($("#tintHex").value),
    tintOpacity: parseInt($("#tintOpacity").value || "100", 10),
    txtFont: $("#txtFont").value || "Open Sans",
    txtSize: parseInt($("#txtSize").value || "56", 10),
    txtHex: normHex($("#txtHex").value),
    txtBold: !!$("#txtBold").checked
  };
}

function persistEditConfig() {
  const cfg = getCurrentCfg();
  saveConfig({ ...cfg, textItems });
}

async function ensureTemplateCache(state) {
  const tplSrc = state.template || "";
  if (!tplSrc) throw new Error("Template kosong");

  if (__tplCache.src === tplSrc && __tplCache.img) return __tplCache;

  const tplImg = await loadImageAsync(tplSrc);
  const slots = detectTransparentSlots(tplImg, 12);
  __tplCache = { src: tplSrc, img: tplImg, slots };
  return __tplCache;
}

async function renderCanvas(state) {
  const canvas = $("#editCanvas");
  if (!canvas) return;

  const token = ++__renderToken;

  // size wajib mengikuti pilihan
  canvas.width = state.targetW || (state.targetOrientation === "portrait" ? 2400 : 3600);
  canvas.height = state.targetH || (state.targetOrientation === "portrait" ? 3600 : 2400);

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!state.template) {
    toast("Template tidak ditemukan.");
    return;
  }
  if (!state.photos || state.photos.length === 0) {
    toast("Foto belum ada.");
    return;
  }

  const cfg = getCurrentCfg();

  const { img: tplImg, slots: rawSlots } = await ensureTemplateCache(state);
  if (token !== __renderToken) return;

  // mapping slot dari ukuran template asli -> target canvas
  const iw = tplImg.naturalWidth || tplImg.width;
  const ih = tplImg.naturalHeight || tplImg.height;
  const sx = canvas.width / iw;
  const sy = canvas.height / ih;

  const slots = (rawSlots || []).map(s => ({
    x: Math.round(s.x * sx),
    y: Math.round(s.y * sy),
    w: Math.round(s.w * sx),
    h: Math.round(s.h * sy),
    _ox: s.x, _oy: s.y, _ow: s.w, _oh: s.h
  }));

  const drawPhotoToSlot = async (photoSrc, slot) => {
    if (!photoSrc || !slot) return;
    const photoImg = await loadImageAsync(photoSrc);
    if (token !== __renderToken) return;
    drawImageCover(ctx, photoImg, slot.x, slot.y, slot.w, slot.h);
  };

  // 1) draw photos into holes
  if (isPolaroidLandscape1x01(state) && state.photos.length >= 1) {
    // copy 1 photo to all slots
    for (const s of slots) {
      await drawPhotoToSlot(state.photos[0], s);
      if (token !== __renderToken) return;
    }
  } else if (isPhotostripTemplate(state)) {
    const perStrip = Math.max(1, state.poseCount || 1);
    const filledPoses = Math.min(state.photos.length, perStrip);

    // need grid map using ORIGINAL slots (better grouping)
    const grid = buildGridMap(rawSlots);
    const axis = decidePhotostripAxis(state, grid);

    const C = grid.cols.length;
    const R = grid.rows.length;

    // helper get scaled slot from raw slot ref
    const scaleSlot = (raw) => {
      if (!raw) return null;
      return {
        x: Math.round(raw.x * sx),
        y: Math.round(raw.y * sy),
        w: Math.round(raw.w * sx),
        h: Math.round(raw.h * sy),
      };
    };

    if (axis === "rows") {
      // pose = rows top->bottom, copy = cols left->right
      for (let poseIdx = 0; poseIdx < filledPoses; poseIdx++) {
        const photoSrc = state.photos[poseIdx];
        for (let copyCol = 0; copyCol < C; copyCol++) {
          const rawSlot = grid.map[copyCol]?.[poseIdx] || null;
          const slot = scaleSlot(rawSlot);
          if (!slot) continue;
          await drawPhotoToSlot(photoSrc, slot);
          if (token !== __renderToken) return;
        }
      }
    } else {
      // pose = cols left->right, copy = rows top->bottom
      for (let poseIdx = 0; poseIdx < filledPoses; poseIdx++) {
        const photoSrc = state.photos[poseIdx];
        for (let copyRow = 0; copyRow < R; copyRow++) {
          const rawSlot = grid.map[poseIdx]?.[copyRow] || null;
          const slot = scaleSlot(rawSlot);
          if (!slot) continue;
          await drawPhotoToSlot(photoSrc, slot);
          if (token !== __renderToken) return;
        }
      }
    }
  } else {
    const n = Math.min(state.photos.length, slots.length);
    for (let i = 0; i < n; i++) {
      await drawPhotoToSlot(state.photos[i], slots[i]);
      if (token !== __renderToken) return;
    }
  }

  // 2) draw template (scaled to target)
  // Use offscreen to apply tint only to template pixels
  const tplLayer = document.createElement("canvas");
  tplLayer.width = canvas.width;
  tplLayer.height = canvas.height;
  const tctx = tplLayer.getContext("2d");
  tctx.clearRect(0, 0, tplLayer.width, tplLayer.height);

  // draw template scaled
  tctx.drawImage(tplImg, 0, 0, iw, ih, 0, 0, canvas.width, canvas.height);

  if (cfg.tintEnable) {
    const tint = normHex(cfg.tintHex);
    const alpha = Math.max(0, Math.min(1, (cfg.tintOpacity || 0) / 100));
    tctx.save();
    tctx.globalCompositeOperation = "source-atop";
    tctx.globalAlpha = alpha;
    tctx.fillStyle = tint;
    tctx.fillRect(0, 0, tplLayer.width, tplLayer.height);
    tctx.restore();
  }

  // draw template on top of photos
  ctx.drawImage(tplLayer, 0, 0);

  // 3) update text layer positions (DOM overlay)
  renderTextLayer(canvas);

  // update data panel
  updateDataPanel(state, cfg);
}

function drawTextsToCanvas(ctx, cfg) {
  // draw textItems onto ctx in TARGET pixels
  for (const item of textItems) {
    const font = item.font || cfg.txtFont || "Open Sans";
    const size = Math.max(10, Math.round(item.size || cfg.txtSize || 56));
    const weight = item.bold ? "800" : "600";
    const color = normHex(item.color || cfg.txtHex || "#FFFFFF");

    ctx.save();
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    ctx.font = `${weight} ${size}px "${font}"`;
    ctx.fillText(item.text || "", item.x || 0, item.y || 0);
    ctx.restore();
  }
}

async function buildFinalDataURL(state) {
  // rebuild same canvas result + text onto export canvas
  const base = $("#editCanvas");
  if (!base) return null;

  // clone base pixels first
  const out = document.createElement("canvas");
  out.width = base.width;
  out.height = base.height;
  const octx = out.getContext("2d", { alpha: false });
  octx.drawImage(base, 0, 0);

  const cfg = getCurrentCfg();
  drawTextsToCanvas(octx, cfg);

  return out.toDataURL("image/png");
}

/* =========================================
   UI WIRING
========================================= */

function wireUI(state) {
  const canvas = $("#editCanvas");

  // tint controls
  $("#tintEnable").addEventListener("change", () => { persistEditConfig(); renderCanvas(state); });
  $("#tintColor").addEventListener("input", () => {
    syncHexPair($("#tintColor"), $("#tintHex"));
    persistEditConfig();
    renderCanvas(state);
  });
  $("#tintHex").addEventListener("input", () => {
    syncHexFromText($("#tintColor"), $("#tintHex"));
    persistEditConfig();
    renderCanvas(state);
  });
  $("#tintOpacity").addEventListener("input", () => { persistEditConfig(); renderCanvas(state); });

  $("#btnResetTint").addEventListener("click", () => {
    $("#tintEnable").checked = true;
    $("#tintColor").value = "#000000";
    $("#tintHex").value = "#000000";
    $("#tintOpacity").value = "100";
    persistEditConfig();
    renderCanvas(state);
  });

  // text controls
  $("#txtColor").addEventListener("input", () => {
    syncHexPair($("#txtColor"), $("#txtHex"));
    updateDataPanel(state, getCurrentCfg());
  });
  $("#txtHex").addEventListener("input", () => {
    syncHexFromText($("#txtColor"), $("#txtHex"));
    updateDataPanel(state, getCurrentCfg());
  });
  $("#txtFont").addEventListener("change", () => updateDataPanel(state, getCurrentCfg()));
  $("#txtSize").addEventListener("input", () => updateDataPanel(state, getCurrentCfg()));
  $("#txtBold").addEventListener("change", () => updateDataPanel(state, getCurrentCfg()));

  $("#btnApplyText").addEventListener("click", () => {
    const text = String($("#txtValue").value || "").trim();
    if (!text) { toast("Isi text dulu."); return; }

    const cfg = getCurrentCfg();
    const id = selectedTextId || `t_${Math.random().toString(16).slice(2)}`;

    // default position (bottom-left safe)
    const x = Math.round((canvas?.width || 2400) * 0.06);
    const y = Math.round((canvas?.height || 3600) * 0.83);

    const existing = textItems.find(t => t.id === id);
    const nextItem = {
      id,
      text,
      font: cfg.txtFont,
      size: cfg.txtSize,
      color: cfg.txtHex,
      bold: cfg.txtBold,
      x: existing ? existing.x : x,
      y: existing ? existing.y : y
    };

    if (existing) Object.assign(existing, nextItem);
    else textItems.push(nextItem);

    selectedTextId = id;
    persistEditConfig();
    renderTextLayer(canvas);
    updateDataPanel(state, cfg);
  });

  $("#btnRemoveText").addEventListener("click", () => {
    if (!selectedTextId) { toast("Pilih teks dulu (klik teks di gambar)."); return; }
    textItems = textItems.filter(t => t.id !== selectedTextId);
    selectedTextId = null;
    persistEditConfig();
    renderTextLayer(canvas);
    updateDataPanel(state, getCurrentCfg());
  });

  // clicking empty stage unselect
  $("#stage").addEventListener("mousedown", (e) => {
    if (e.target && e.target.classList?.contains("txtItem")) return;
    selectedTextId = null;
    renderTextLayer(canvas);
  });

  // resize -> re-place text DOM
  const ro = new ResizeObserver(() => {
    renderTextLayer(canvas);
  });
  ro.observe($("#stage"));

  // nav buttons
  $("#btnBack").addEventListener("click", () => {
    window.location.href = "snapcam.html";
  });

  $("#btnNext").addEventListener("click", async () => {
    try {
      const dataUrl = await buildFinalDataURL(state);
      if (!dataUrl) { toast("Gagal membuat hasil."); return; }

      sessionStorage.setItem(EDIT_RESULT_KEY, dataUrl);
      persistEditConfig();

      // juga simpan ke flow state biar export gampang
      const stRaw = sessionStorage.getItem(FLOW_KEY);
      const st = stRaw ? safeParseJSON(stRaw) : null;
      if (st && typeof st === "object") {
        st.edit = { ...(loadConfig() || {}), textItems };
        sessionStorage.setItem(FLOW_KEY, JSON.stringify(st));
      }

      window.location.href = "export.html";
    } catch (e) {
      console.error(e);
      toast("Gagal lanjut ke Export.");
    }
  });
}

/* =========================================
   INIT
========================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const state = loadState();
  if (!state) {
    toast("State tidak ditemukan. Kembali ke Snap.");
    setTimeout(() => (window.location.href = "snapcam.html"), 700);
    return;
  }

  // simpan global
  window.__pbState = state;

  // init UI with saved config if any
  const cfgSaved = loadConfig();
  const cfg = { ...cfgDefault, ...(cfgSaved || {}) };

  // restore UI controls
  $("#tintEnable").checked = !!cfg.tintEnable;
  $("#tintHex").value = normHex(cfg.tintHex);
  $("#tintColor").value = normHex(cfg.tintHex);
  $("#tintOpacity").value = String(Math.max(0, Math.min(100, cfg.tintOpacity ?? 100)));

  $("#txtFont").value = cfg.txtFont || "Open Sans";
  $("#txtSize").value = String(cfg.txtSize || 56);
  $("#txtHex").value = normHex(cfg.txtHex);
  $("#txtColor").value = normHex(cfg.txtHex);
  $("#txtBold").checked = !!cfg.txtBold;

  // restore texts
  textItems = Array.isArray(cfg.textItems) ? cfg.textItems : [];
  selectedTextId = null;

  // fill data panel basics
  updateDataPanel(state, getCurrentCfg());

  // first render
  try {
    await renderCanvas(state);
  } catch (e) {
    console.error(e);
    toast("Gagal render template.");
  }

  // wire UI
  wireUI(state);
});
