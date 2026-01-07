/* =========================================
   STEP LOCKING (Layout -> Snap -> Edit -> Export)
========================================= */

const STEP_ORDER = ["layout", "snap", "edit", "export"];
const PROGRESS_KEY = "pb_unlocked_step_index";

function getUnlockedIndex() {
  const n = parseInt(localStorage.getItem(PROGRESS_KEY) || "0", 10);
  return Number.isFinite(n)
    ? Math.max(0, Math.min(n, STEP_ORDER.length - 1))
    : 0;
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
function lockToSnap() {
  setUnlockedIndex(STEP_ORDER.indexOf("snap"));
  updateStepLocks();
}
function unlockEditIfReady(isReady) {
  if (isReady) setUnlockedIndex(STEP_ORDER.indexOf("edit"));
  else setUnlockedIndex(STEP_ORDER.indexOf("snap"));
  updateStepLocks();
}

/* =========================================
   SNAPCAM FLOW
========================================= */

const FLOW_KEY = "pb_flow_state";
const $ = (sel, root = document) => root.querySelector(sel);

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

function parsePoseCount(poseStr) {
  const m = String(poseStr || "").match(/(\d+)\s*x/i);
  const n = m ? parseInt(m[1], 10) : 1;
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(6, Math.max(1, n));
}

function pickTargetSize({ angle, orientasi }) {
  const a = String(angle || "").toLowerCase();
  const o = String(orientasi || "").toLowerCase();
  if (a.includes("angle portrait"))
    return { w: 2400, h: 3600, orientation: "portrait" };
  if (a.includes("angle landscape"))
    return { w: 3600, h: 2400, orientation: "landscape" };
  if (o.includes("portrait"))
    return { w: 2400, h: 3600, orientation: "portrait" };
  return { w: 3600, h: 2400, orientation: "landscape" };
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function normalizeState(s) {
  if (typeof s.countdownSeconds !== "number") s.countdownSeconds = 3;
  if (![0, 1, 3, 5].includes(s.countdownSeconds)) s.countdownSeconds = 3;
  if (typeof s.mirror !== "boolean") s.mirror = true;
  if (typeof s.bw !== "boolean") s.bw = false; // ✅ BnW
  if (!Array.isArray(s.photos)) s.photos = [];
  return s;
}

function loadFromQueryOrRestore() {
  const params = new URLSearchParams(window.location.search);

  const fromQuery = {
    template: params.get("template") ? safeDecode(params.get("template")) : "",
    name: params.get("name") ? safeDecode(params.get("name")) : "",
    jenis: params.get("jenis") ? safeDecode(params.get("jenis")) : "",
    orientasi: params.get("orientasi")
      ? safeDecode(params.get("orientasi"))
      : "",
    angle: params.get("angle") ? safeDecode(params.get("angle")) : "",
    pose: params.get("pose") ? safeDecode(params.get("pose")) : "",
  };

  const hasQuery = Object.values(fromQuery).some(
    (v) => String(v || "").trim() !== ""
  );
  if (!hasQuery) {
    const raw = sessionStorage.getItem(FLOW_KEY);
    if (raw) {
      try {
        return normalizeState(JSON.parse(raw));
      } catch {}
    }
  }

  const poseCount = parsePoseCount(fromQuery.pose);
  const target = pickTargetSize(fromQuery);

  const state = normalizeState({
    ...fromQuery,
    poseCount,
    targetW: target.w,
    targetH: target.h,
    targetOrientation: target.orientation,
    photos: [],
    createdAt: Date.now(),
    countdownSeconds: 3,
    mirror: true,
    bw: false, // ✅ BnW
  });

  sessionStorage.setItem(FLOW_KEY, JSON.stringify(state));
  return state;
}

function saveState(state) {
  sessionStorage.setItem(FLOW_KEY, JSON.stringify(state));
}

/* =========================================
   TEMPLATE PREVIEW
========================================= */

function resetTemplatePreviewToBase(state) {
  __previewToken++;
  const imgEl = $("#tplPreviewImg");
  const fb = $("#tplPreviewFallback");
  if (!imgEl) return;

  imgEl.src = state.template || "";
  if (fb) fb.style.display = state.template ? "none" : "flex";
}

function ensureTemplatePreview(state) {
  const img = $("#tplPreviewImg");
  const fb = $("#tplPreviewFallback");
  if (!img) return;

  img.onload = () => {
    if (fb) fb.style.display = "none";
  };
  img.onerror = () => {
    if (fb) fb.style.display = "flex";
  };

  resetTemplatePreviewToBase(state);
  updateTemplatePreviewComposite(state);
}

/* ===========================
   COMPOSITE ENGINE
=========================== */

let __tplCache = { src: "", img: null, slots: null };
let __previewToken = 0;

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

  let sx = 0,
    sy = 0,
    sw = iw,
    sh = ih;

  if (srcR > targetR) {
    sw = Math.round(ih * targetR);
    sx = Math.round((iw - sw) / 2);
  } else {
    sh = Math.round(iw / targetR);
    sy = Math.round((ih - sh) / 2);
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function detectTransparentSlots(tplImg, wantCount = 6) {
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

      let minX = x,
        maxX = x,
        minY = y,
        maxY = y;
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

  picked.sort((a, b) => a.y - b.y || a.x - b.x);
  return picked;
}

/* ===========================
   RULES khusus photostrip
=========================== */

function normName(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}
function isPolaroidLandscape1x01(state) {
  return normName(state.name) === "polaroid landscape 1x - 01";
}
function isPhotostripTemplate(state) {
  return normName(state.name).includes("photostrip");
}

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
    } else groups.push({ sum: v, n: 1, center: v });
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
    let bi = 0,
      bd = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const d = Math.abs(centers[i] - v);
      if (d < bd) {
        bd = d;
        bi = i;
      }
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

  if (R !== C) {
    if (R === perStrip) return "rows";
    if (C === perStrip) return "cols";
    return R > C ? "rows" : "cols";
  }

  if (name.includes("portrait")) return "rows";
  if (name.includes("landscape")) return "cols";
  return "rows";
}

async function updateTemplatePreviewComposite(state) {
  const tplSrc = state.template || "";
  const imgEl = $("#tplPreviewImg");
  const fb = $("#tplPreviewFallback");
  if (!imgEl) return;

  if (!tplSrc) {
    if (fb) fb.style.display = "flex";
    return;
  }

  if (!state.photos || state.photos.length === 0) {
    resetTemplatePreviewToBase(state);
    return;
  }

  const token = ++__previewToken;

  try {
    if (__tplCache.src !== tplSrc) {
      const tplImg = await loadImageAsync(tplSrc);
      const slots = detectTransparentSlots(tplImg, 12);
      __tplCache = { src: tplSrc, img: tplImg, slots };
    }

    if (token !== __previewToken) return;

    const tplImg = __tplCache.img;
    const rawSlots = __tplCache.slots || [];

    if (!tplImg || rawSlots.length === 0) {
      imgEl.src = tplSrc;
      if (fb) fb.style.display = "none";
      return;
    }

    const cw = tplImg.naturalWidth || tplImg.width;
    const ch = tplImg.naturalHeight || tplImg.height;

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext("2d");

    const drawPhotoToSlot = async (photoSrc, slot) => {
      if (!photoSrc || !slot) return;
      const photoImg = await loadImageAsync(photoSrc);
      if (token !== __previewToken) return;
      drawImageCover(ctx, photoImg, slot.x, slot.y, slot.w, slot.h);
    };

    if (isPolaroidLandscape1x01(state) && state.photos.length >= 1) {
      const grid = buildGridMap(rawSlots);
      for (let ci = 0; ci < grid.map.length; ci++) {
        for (let ri = 0; ri < grid.map[ci].length; ri++) {
          const s = grid.map[ci][ri];
          if (!s) continue;
          await drawPhotoToSlot(state.photos[0], s);
          if (token !== __previewToken) return;
        }
      }
    } else if (isPhotostripTemplate(state)) {
      const perStrip = Math.max(1, state.poseCount || 1);
      const filledPoses = Math.min(state.photos.length, perStrip);

      const grid = buildGridMap(rawSlots);
      const axis = decidePhotostripAxis(state, grid);

      const C = grid.cols.length;
      const R = grid.rows.length;

      if (axis === "rows") {
        for (let poseIdx = 0; poseIdx < filledPoses; poseIdx++) {
          const photoSrc = state.photos[poseIdx];
          for (let copyCol = 0; copyCol < C; copyCol++) {
            const slot = grid.map[copyCol]?.[poseIdx] || null;
            if (!slot) continue;
            await drawPhotoToSlot(photoSrc, slot);
            if (token !== __previewToken) return;
          }
        }
      } else {
        for (let poseIdx = 0; poseIdx < filledPoses; poseIdx++) {
          const photoSrc = state.photos[poseIdx];
          for (let copyRow = 0; copyRow < R; copyRow++) {
            const slot = grid.map[poseIdx]?.[copyRow] || null;
            if (!slot) continue;
            await drawPhotoToSlot(photoSrc, slot);
            if (token !== __previewToken) return;
          }
        }
      }
    } else {
      const n = Math.min(state.photos.length, rawSlots.length);
      const slots = [...rawSlots].sort((a, b) => a.y - b.y || a.x - b.x);
      for (let i = 0; i < n; i++) {
        await drawPhotoToSlot(state.photos[i], slots[i]);
        if (token !== __previewToken) return;
      }
    }

    ctx.drawImage(tplImg, 0, 0, cw, ch);

    imgEl.src = canvas.toDataURL("image/png");
    if (fb) fb.style.display = "none";
  } catch (e) {
    console.error("Template composite failed:", e);
    imgEl.src = tplSrc;
    if (fb) fb.style.display = "flex";
  }
}

/* ==========================
   UI apply
========================== */

function applyMirrorToPreview(state) {
  const stage = $("#camStage");
  if (!stage) return;
  stage.classList.toggle("mirrored", !!state.mirror);
}

function applyBWToPreview(state) {
  const stage = $("#camStage");
  if (!stage) return;
  stage.classList.toggle("bw", !!state.bw);
}

function applyControlsUI(state) {
  $("#mirrorToggle").checked = !!state.mirror;
  $("#countdownSelect").value = String(state.countdownSeconds);
  const bw = $("#bwToggle");
  if (bw) bw.checked = !!state.bw;

  applyMirrorToPreview(state);
  applyBWToPreview(state);
}

function updateMetaUI(state) {
  const snapSub = $("#snapSub");
  if (snapSub) snapSub.textContent = "";

  $("#tplName").textContent = state.name || "-";
  $("#tplJenis").textContent = state.jenis || "-";
  $("#tplOrientasi").textContent = state.orientasi || state.targetOrientation;

  $("#counter").textContent = `${state.photos.length}/${state.poseCount}`;

  const root = document.querySelector(".pb-snap");
  if (root) root.setAttribute("data-orientation", state.targetOrientation);
}

function renderThumbs(state) {
  const wrap = $("#thumbGrid");
  const desc = $("#thumbDesc");
  wrap.innerHTML = "";

  desc.textContent = state.photos.length
    ? `${state.photos.length} foto tersimpan.`
    : "Belum ada foto.";

  state.photos.forEach((dataUrl, idx) => {
    const d = document.createElement("div");
    d.className = "thumb";

    if (state.targetOrientation === "portrait") d.classList.add("isPortrait");
    d.setAttribute("data-orientation", state.targetOrientation);

    d.innerHTML = `<img alt="Photo ${idx + 1}"><div class="num">${
      idx + 1
    }</div>`;
    d.querySelector("img").src = dataUrl;
    wrap.appendChild(d);
  });

  $("#counter").textContent = `${state.photos.length}/${state.poseCount}`;

  const canRetake = state.photos.length > 0;
  $("#btnRetake").classList.toggle("hidden", !canRetake);
  $("#btnRetakeAll").disabled = !canRetake;

  const complete = state.photos.length >= state.poseCount;
  $("#btnProceed").disabled = !complete;

  unlockEditIfReady(complete);
  updateTemplatePreviewComposite(state);
}

/* ==========================
   CAMERA
========================== */

async function startCamera(preferFront = true) {
  stopCamera();

  const constraints = {
    audio: false,
    video: {
      facingMode: preferFront ? "user" : "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  const video = $("#video");
  video.srcObject = stream;
  await video.play();

  window.__pbStream = stream;
}

function stopCamera() {
  const stream = window.__pbStream;
  if (stream && stream.getTracks) stream.getTracks().forEach((t) => t.stop());
  window.__pbStream = null;
}

function setBusy(isBusy) {
  $("#btnCapture").disabled = isBusy;
  $("#mirrorToggle").disabled = isBusy;
  $("#countdownSelect").disabled = isBusy;

  const upBtn = $("#btnUpload");
  if (upBtn) upBtn.disabled = isBusy;
  const fp = $("#filePicker");
  if (fp) fp.disabled = isBusy;

  const bw = $("#bwToggle");
  if (bw) bw.disabled = isBusy; // ✅ BnW
}

async function countdown(seconds) {
  if (!seconds || seconds <= 0) return;
  const el = $("#countdown");
  el.textContent = "";
  el.classList.remove("show");

  for (let s = seconds; s >= 1; s--) {
    el.textContent = String(s);
    el.classList.add("show");
    await new Promise((r) => setTimeout(r, 650));
    el.classList.remove("show");
    await new Promise((r) => setTimeout(r, 140));
  }
  el.textContent = "";
}

function drawCover(video, ctx, w, h, mirror = true, bw = false) {
  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  if (!vw || !vh) return;

  const targetR = w / h;
  const sourceR = vw / vh;

  let sx = 0,
    sy = 0,
    sw = vw,
    sh = vh;

  if (sourceR > targetR) {
    sw = Math.round(vh * targetR);
    sx = Math.round((vw - sw) / 2);
  } else {
    sh = Math.round(vw / targetR);
    sy = Math.round((vh - sh) / 2);
  }

  ctx.save();
  ctx.clearRect(0, 0, w, h);

  // ✅ BnW on canvas result
  ctx.filter = bw ? "grayscale(1)" : "none";

  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  ctx.restore();
}

async function canvasToDataURLAsync(canvas, quality = 0.92) {
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("toBlob gagal");
  return await new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(blob);
  });
}

async function captureFrameAsync(state) {
  const video = $("#video");
  const canvas = document.createElement("canvas");
  canvas.width = state.targetW;
  canvas.height = state.targetH;

  const ctx = canvas.getContext("2d", { alpha: false });
  drawCover(
    video,
    ctx,
    canvas.width,
    canvas.height,
    !!state.mirror,
    !!state.bw
  );

  return await canvasToDataURLAsync(canvas, 0.92);
}

/* ==========================
   UPLOAD / DRAG & DROP
========================== */

function isImageFile(file) {
  return (
    !!file && typeof file.type === "string" && file.type.startsWith("image/")
  );
}

async function fileToDataURL(file) {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function importImageAsCaptured(state, dataUrl) {
  const img = await loadImageAsync(dataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = state.targetW;
  canvas.height = state.targetH;

  const ctx = canvas.getContext("2d", { alpha: false });

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ✅ BnW untuk upload juga
  ctx.filter = state.bw ? "grayscale(1)" : "none";

  if (state.mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  drawImageCover(ctx, img, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  return await canvasToDataURLAsync(canvas, 0.92);
}

async function addPhotoFromFile(state, file) {
  if (!isImageFile(file)) {
    toast("File harus gambar (JPG/PNG/WebP).");
    return;
  }
  if (state.photos.length >= state.poseCount) {
    toast("Jumlah foto sudah lengkap. Klik Next: Edit.");
    return;
  }

  try {
    setBusy(true);
    const dataUrl = await fileToDataURL(file);
    const normalized = await importImageAsCaptured(state, dataUrl);

    state.photos.push(normalized);
    saveState(state);
    renderThumbs(state);
  } catch (e) {
    console.error(e);
    toast("Gagal memproses file gambar.");
  } finally {
    setBusy(false);
  }
}

function wireUploadAndDrop(state) {
  const btnUpload = $("#btnUpload");
  const filePicker = $("#filePicker");
  const dropOverlay = $("#dropOverlay");
  const camStage = $("#camStage");
  if (!camStage) return;

  const show = () => dropOverlay?.classList.add("show");
  const hide = () => dropOverlay?.classList.remove("show");

  btnUpload?.addEventListener("click", () => filePicker?.click());

  filePicker?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (file) await addPhotoFromFile(state, file);
    e.target.value = "";
  });

  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  let dragDepth = 0;

  ["dragenter", "dragover"].forEach((evt) => {
    camStage.addEventListener(evt, (e) => {
      prevent(e);
      const hasFiles = e.dataTransfer?.types?.includes?.("Files");
      if (!hasFiles) return;
      dragDepth++;
      show();
    });
  });

  ["dragleave", "dragend"].forEach((evt) => {
    camStage.addEventListener(evt, (e) => {
      prevent(e);
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) hide();
    });
  });

  camStage.addEventListener("drop", async (e) => {
    prevent(e);
    dragDepth = 0;
    hide();

    const file = e.dataTransfer?.files?.[0];
    if (file) await addPhotoFromFile(state, file);
  });
}

/* ==========================
   CAPTURE FLOW
========================== */

async function onCapture(state) {
  if (state.photos.length >= state.poseCount) {
    toast("Jumlah foto sudah lengkap. Klik Next: Edit.");
    return;
  }

  setBusy(true);

  await countdown(state.countdownSeconds);
  await new Promise(requestAnimationFrame);

  const url = await captureFrameAsync(state);
  state.photos.push(url);

  saveState(state);
  renderThumbs(state);

  setBusy(false);
}

function retakeLast(state) {
  if (state.photos.length === 0) return;
  state.photos.pop();
  saveState(state);
  renderThumbs(state);
}

function retakeAll(state) {
  state.photos = [];
  saveState(state);
  renderThumbs(state);
  resetTemplatePreviewToBase(state);
}

function proceedToEdit(state) {
  if (state.photos.length < state.poseCount) {
    toast(`Masih kurang ${state.poseCount - state.photos.length} foto.`);
    return;
  }
  unlockUntil("edit");
  updateStepLocks();
  saveState(state);
  window.location.href = "edit.html";
}

function wireUI(state) {
  $("#btnCapture").addEventListener("click", () => onCapture(state));
  $("#btnRetake").addEventListener("click", () => retakeLast(state));
  $("#btnRetakeAll").addEventListener("click", () => retakeAll(state));
  $("#btnProceed").addEventListener("click", () => proceedToEdit(state));

  $("#mirrorToggle")?.addEventListener("change", (e) => {
    state.mirror = !!e.target.checked;
    applyMirrorToPreview(state);
    updateMetaUI(state);
    saveState(state);
    updateTemplatePreviewComposite(state);
  });

  $("#countdownSelect")?.addEventListener("change", (e) => {
    const v = parseInt(e.target.value, 10);
    state.countdownSeconds = [0, 1, 3, 5].includes(v) ? v : 3;
    updateMetaUI(state);
    saveState(state);
  });

  // ✅ BnW toggle
  $("#bwToggle")?.addEventListener("change", (e) => {
    state.bw = !!e.target.checked;
    applyBWToPreview(state);
    saveState(state);
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      onCapture(state);
    }
  });

  window.addEventListener("beforeunload", () => stopCamera());

  wireUploadAndDrop(state);
}

document.addEventListener("DOMContentLoaded", async () => {
  setActiveStep("snap");
  lockToSnap();
  bindStepNavigation();

  const state = loadFromQueryOrRestore();

  applyControlsUI(state);
  updateMetaUI(state);
  renderThumbs(state);
  ensureTemplatePreview(state);

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast("Browser tidak mendukung kamera (getUserMedia).");
      $("#btnCapture").disabled = true;
      return;
    }
    await startCamera(true);
  } catch (e) {
    console.error(e);
    toast("Akses kamera ditolak / tidak tersedia.");
    $("#btnCapture").disabled = true;
  }

  wireUI(state);
});
