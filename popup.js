/**
 * popup.js — PromptDeck
 *
 * Flow:
 *   1. User loads .md file
 *   2. parse() splits global design system + each ## SLIDE block
 *   3. Optionally attach saved reference images (logos, product shots, etc.)
 *      to specific slides — the reference library persists across decks;
 *      per-slide attachments reset when a new file is loaded.
 *   4. "Start Sequence":
 *        a. Generate a runId, ask the background worker to QUEUE_SEQUENCE
 *           with the full ordered slide list (each slide's final prompt text
 *           includes a line per attached reference; the reference image
 *           bytes ride along too, for content.js to actually upload)
 *        b. Worker opens ONE chatgpt.com tab and hands it the whole queue
 *        c. content.js drives the entire deck through that one conversation —
 *           attach references, inject prompt, wait for the image, capture
 *           it, next slide — and writes live progress + captured images to
 *           chrome.storage.local
 *        d. This popup listens for storage changes and updates the slide
 *           list live. When done, content.js auto-builds a PDF; "Export PDF"
 *           here just re-reads whatever images are stored and re-builds it
 *           on demand (e.g. to grab a partial deck, or download it again).
 */

"use strict";

let slides = [];
let currentRunId = null;
let currentRunStatus = null;

// Reference image library (persists across decks) and per-slide attachments
// (specific to the currently loaded deck).
let refs = {};          // { [id]: { id, name, dataUrl } }
let slideRefs = {};     // { [slideNumber]: [id, ...] }
let openRefPicker = null; // slide number whose attach-picker is expanded, if any
let pendingRefFile = null; // { dataUrl, filename } awaiting a name before saving

// Keys under which state is remembered, so switching or closing this tab
// never forces a re-upload or loses progress on an in-flight run.
const LAST_MD_KEY = "lastMarkdown";
const LAST_RUN_KEY = "promptdeck_last_run";
const REFS_KEY = "promptdeck_references";
const SLIDE_REFS_KEY = "promptdeck_slide_refs";

// ── EVENT WIRING ─────────────────────────────────────────────────────────────
// Manifest V3 blocks inline onclick="" handlers, so everything is wired here.

document.getElementById("fileInput").addEventListener("change", function () {
  const file = this.files[0];
  if (!file) return;
  readFile(file);
});

document.getElementById("dropZone").addEventListener("click", () => {
  document.getElementById("fileInput").click();
});

document.getElementById("startBtn").addEventListener("click", startSequence);
document.getElementById("exportBtn").addEventListener("click", exportPdf);
document.getElementById("resetBtn").addEventListener("click", reset);

// Per-slide manual "send" buttons are created dynamically — use delegation.
document.getElementById("slideList").addEventListener("click", (e) => {
  const sendBtn = e.target.closest("button.btn-send");
  if (sendBtn && !sendBtn.disabled) {
    sendSingleSlide(parseInt(sendBtn.dataset.num, 10));
    return;
  }

  const attachBtn = e.target.closest("button.btn-attach-ref");
  if (attachBtn) {
    const num = parseInt(attachBtn.dataset.num, 10);
    openRefPicker = openRefPicker === num ? null : num;
    renderSlides();
    return;
  }

  const pillX = e.target.closest("button.ref-pill-x");
  if (pillX) {
    const num = parseInt(pillX.dataset.num, 10);
    const refId = pillX.dataset.ref;
    slideRefs[num] = (slideRefs[num] || []).filter((id) => id !== refId);
    saveSlideRefs();
    renderSlides();
  }
});

document.getElementById("slideList").addEventListener("change", (e) => {
  const cb = e.target.closest("input[type='checkbox'][data-ref]");
  if (!cb) return;
  const num = parseInt(cb.dataset.num, 10);
  const refId = cb.dataset.ref;
  const current = slideRefs[num] || [];
  slideRefs[num] = cb.checked ? [...current, refId] : current.filter((id) => id !== refId);
  saveSlideRefs();
  renderSlides();
});

// Reference image library wiring
document.getElementById("addRefBtn").addEventListener("click", () => {
  document.getElementById("refFileInput").click();
});

document.getElementById("refFileInput").addEventListener("change", function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingRefFile = { dataUrl: e.target.result, filename: file.name };
    renderRefsList();
  };
  reader.readAsDataURL(file);
  this.value = "";
});

document.getElementById("refsList").addEventListener("click", (e) => {
  const saveBtn = e.target.closest("button.ref-pending-save");
  if (saveBtn) {
    const input = document.getElementById("refNameInput");
    const name = input.value.trim();
    if (!name || !pendingRefFile) return;
    const id = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    refs[id] = { id, name, dataUrl: pendingRefFile.dataUrl };
    pendingRefFile = null;
    saveRefs();
    renderRefsList();
    renderSlides();
    return;
  }

  const cancelBtn = e.target.closest("button.ref-pending-cancel");
  if (cancelBtn) {
    pendingRefFile = null;
    renderRefsList();
    return;
  }

  const delBtn = e.target.closest("button.ref-delete");
  if (delBtn) {
    const id = delBtn.dataset.id;
    delete refs[id];
    Object.keys(slideRefs).forEach((num) => {
      slideRefs[num] = (slideRefs[num] || []).filter((refId) => refId !== id);
    });
    saveRefs();
    saveSlideRefs();
    renderRefsList();
    renderSlides();
  }
});

// Drag-and-drop on drop zone
const dropZone = document.getElementById("dropZone");

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag");
  const file = e.dataTransfer.files[0];
  if (file) readFile(file);
});

function readFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => processMarkdown(e.target.result);
  reader.readAsText(file);
}

// ── PARSER ───────────────────────────────────────────────────────────────────

function processMarkdown(raw, opts = {}) {
  const errEl = document.getElementById("parseError");
  errEl.style.display = "none";

  // Split at ## SLIDE boundaries, keep each chunk with its header
  const parts = raw.split(/(?=^## SLIDE \d+)/m);

  const globalContent = parts[0].trim();

  slides = [];

  for (const chunk of parts.slice(1)) {
    const trimmed = chunk.trim();
    const firstLine = trimmed.split("\n")[0];

    // Match: ## SLIDE 01 — TITLE  or  ## SLIDE 01 - TITLE
    const m = firstLine.match(/^##\s+SLIDE\s+(\d+)\s*[—\-–]+\s*(.+)$/);
    if (!m) continue;

    const num   = parseInt(m[1], 10);
    const title = m[2].trim();

    // Combined = "generate Image" instruction + global design system +
    // this slide's section. The leading instruction tells ChatGPT to render
    // an image for every slide prompt.
    const combined =
      "generate Image\n\n" + globalContent + "\n\n---\n\n" + trimmed;

    slides.push({ number: num, title, combined });
  }

  if (slides.length === 0) {
    errEl.style.display = "block";
    return;
  }

  // Remember this file's contents so a tab switch / reopen restores it.
  if (!opts.restore) {
    chrome.storage.local.set({ [LAST_MD_KEY]: raw });
    // A genuinely new deck — per-slide reference attachments from whatever
    // was loaded before don't carry over (slide numbers would collide
    // meaninglessly across unrelated decks). The reference LIBRARY itself
    // is untouched, since that's meant to persist across decks.
    slideRefs = {};
    saveSlideRefs();
  }

  renderSlides();
  showSlidesState();
}

// On load, bring back the last file the user worked with, the reference
// library, per-slide attachments, then reconnect to any run in flight.
(async function restoreOnLoad() {
  const d = await chrome.storage.local.get([
    LAST_MD_KEY,
    LAST_RUN_KEY,
    REFS_KEY,
    SLIDE_REFS_KEY,
  ]);

  refs = d[REFS_KEY] || {};
  slideRefs = d[SLIDE_REFS_KEY] || {};

  if (d[LAST_MD_KEY]) processMarkdown(d[LAST_MD_KEY], { restore: true });
  renderRefsList();

  if (d[LAST_RUN_KEY]) {
    currentRunId = d[LAST_RUN_KEY].runId;
    const statusKey = runKey(currentRunId);
    const s = await chrome.storage.local.get(statusKey);
    currentRunStatus = s[statusKey] || null;
    renderSlides();
    updateActionButtons();
  }
})();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !currentRunId) return;
  const key = runKey(currentRunId);
  if (changes[key]) {
    currentRunStatus = changes[key].newValue || null;
    renderSlides();
    updateActionButtons();
  }
});

// ── RENDER: SLIDES ───────────────────────────────────────────────────────────

function showSlidesState() {
  document.getElementById("state-load").style.display = "none";
  document.getElementById("state-slides").style.display = "block";
  document.getElementById("slideCount").textContent = `${slides.length} SLIDES`;
  document.getElementById("slidesTitle").textContent = `${slides.length} SLIDES PARSED`;
}

function slideState(num) {
  if (!currentRunStatus) return "pending";
  if ((currentRunStatus.doneNumbers || []).includes(num)) return "done";
  if ((currentRunStatus.noCaptureNumbers || []).includes(num)) return "no-capture";
  if ((currentRunStatus.failedNumbers || []).includes(num)) return "failed";
  if (currentRunStatus.currentNumber === num && currentRunStatus.phase === "running") return "active";
  return "pending";
}

const STATE_LABEL = {
  pending: "Pending",
  active: "Working…",
  done: "Done",
  "no-capture": "No capture",
  failed: "Failed",
};

const SEND_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;

function renderSlides() {
  const list = document.getElementById("slideList");
  list.innerHTML = "";

  const running = currentRunStatus && currentRunStatus.phase === "running";
  const refList = Object.values(refs);
  let doneCount = 0;

  slides.forEach((s) => {
    const state = slideState(s.number);
    if (state === "done") doneCount++;

    const attached = slideRefs[s.number] || [];
    const pills = attached
      .map((id) => refs[id])
      .filter(Boolean)
      .map(
        (r) => `
        <span class="ref-pill">${escHtml(r.name)}
          <button class="ref-pill-x" data-num="${s.number}" data-ref="${r.id}" title="Remove">×</button>
        </span>`
      )
      .join("");

    const pickerOpen = openRefPicker === s.number;
    const pickerRows = refList.length
      ? refList
          .map(
            (r) => `
        <label>
          <input type="checkbox" data-num="${s.number}" data-ref="${r.id}" ${attached.includes(r.id) ? "checked" : ""}>
          ${escHtml(r.name)}
        </label>`
          )
          .join("")
      : `<span class="ref-picker-empty">No reference images saved yet — add one above.</span>`;

    const item = document.createElement("div");
    item.className = `slide-item ${state}`;
    item.innerHTML = `
      <div class="slide-row-main">
        <span class="slide-num">${String(s.number).padStart(2, "0")}</span>
        <span class="slide-title">${escHtml(s.title)}</span>
        <span class="slide-status-text">${STATE_LABEL[state]}</span>
        <span class="slide-dot ${state}"></span>
        <button class="btn-send" data-num="${s.number}" title="Send this slide's prompt now" ${running ? "disabled" : ""}>
          ${SEND_ICON}
        </button>
      </div>
      <div class="slide-row-refs">
        ${pills}
        <button class="btn-attach-ref" data-num="${s.number}">${pickerOpen ? "Done" : "+ Reference"}</button>
      </div>
      <div class="ref-picker ${pickerOpen ? "open" : ""}">
        ${pickerRows}
      </div>
    `;
    list.appendChild(item);
  });

  const count = document.getElementById("slideCount");
  count.textContent = currentRunStatus ? `${doneCount}/${slides.length} done` : `${slides.length} slides`;
}

function updateActionButtons() {
  const startBtn = document.getElementById("startBtn");
  const exportBtn = document.getElementById("exportBtn");

  const running = currentRunStatus && currentRunStatus.phase === "running";
  startBtn.disabled = running;
  document.getElementById("startBtnLabel").textContent = running ? "Running…" : "Start Sequence";

  const hasImages = currentRunStatus && (currentRunStatus.doneNumbers || []).length > 0;
  exportBtn.disabled = !hasImages;
}

// ── RENDER: REFERENCE IMAGE LIBRARY ──────────────────────────────────────────

function renderRefsList() {
  const list = document.getElementById("refsList");
  const items = Object.values(refs);

  let html = "";

  if (pendingRefFile) {
    html += `
      <div class="ref-pending">
        <img class="ref-thumb" src="${pendingRefFile.dataUrl}" alt="">
        <input type="text" id="refNameInput" placeholder="Name this image (e.g. Logo)" autofocus>
        <button class="btn btn-ghost ref-pending-save">Save</button>
        <button class="btn btn-ghost ref-pending-cancel">Cancel</button>
      </div>
    `;
  }

  if (items.length === 0 && !pendingRefFile) {
    html += `<span class="refs-empty">None yet — add a logo or product shot to reuse across slides and decks.</span>`;
  } else {
    html += items
      .map(
        (r) => `
      <div class="ref-item">
        <img class="ref-thumb" src="${r.dataUrl}" alt="">
        <span class="ref-name">${escHtml(r.name)}</span>
        <button class="ref-delete" data-id="${r.id}" title="Delete">×</button>
      </div>`
      )
      .join("");
  }

  list.innerHTML = html;
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── STORAGE HELPERS ──────────────────────────────────────────────────────────

function runKey(runId) {
  return `promptdeck_run_${runId}`;
}

function imageKeyPrefix(runId) {
  return `promptdeck_img_${runId}_`;
}

function generateRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function saveRefs() {
  await chrome.storage.local.set({ [REFS_KEY]: refs });
}

async function saveSlideRefs() {
  await chrome.storage.local.set({ [SLIDE_REFS_KEY]: slideRefs });
}

// Builds the final per-slide payload sent to the background/content script:
// the prompt text with a line appended per attached reference, plus the
// actual reference image bytes for content.js to upload into ChatGPT.
function buildSlidePayload(slide) {
  const attached = (slideRefs[slide.number] || []).map((id) => refs[id]).filter(Boolean);

  let combined = slide.combined;
  attached.forEach((r) => {
    combined += `\n\nUse the attached reference image — image of ${r.name} given in reference as ${r.name}.`;
  });

  return {
    number: slide.number,
    title: slide.title,
    combined,
    references: attached.map((r) => ({ name: r.name, dataUrl: r.dataUrl })),
  };
}

// ── START SEQUENCE ───────────────────────────────────────────────────────────

async function startSequence() {
  if (slides.length === 0) return;
  if (currentRunStatus && currentRunStatus.phase === "running") return;

  const runId = generateRunId();
  currentRunId = runId;
  currentRunStatus = { phase: "running", total: slides.length, doneNumbers: [], failedNumbers: [] };

  await chrome.storage.local.set({
    [LAST_RUN_KEY]: { runId, startedAt: Date.now() },
  });

  renderSlides();
  updateActionButtons();

  // The service worker opens one fresh ChatGPT tab and remembers the whole
  // ordered slide queue for that tab's id — content.js then claims it and
  // drives the sequence (race-free, same handoff pattern as before, just
  // with a full queue instead of a single prompt).
  await chrome.runtime.sendMessage({
    type: "QUEUE_SEQUENCE",
    runId,
    slides: slides.map(buildSlidePayload),
  });
}

// ── MANUAL PER-SLIDE SEND ────────────────────────────────────────────────────
// Opens a fresh ChatGPT tab and injects just this one slide's prompt — for
// retrying a single slide (e.g. one PromptDeck couldn't confirm an image
// for) without restarting the whole deck. Reuses the current run's id so a
// successful capture merges into the same deck's image set / PDF.

async function sendSingleSlide(num) {
  const slide = slides.find((s) => s.number === num);
  if (!slide) return;
  if (currentRunStatus && currentRunStatus.phase === "running") return;

  if (!currentRunId) {
    currentRunId = generateRunId();
    await chrome.storage.local.set({
      [LAST_RUN_KEY]: { runId: currentRunId, startedAt: Date.now() },
    });
  }

  await chrome.runtime.sendMessage({
    type: "QUEUE_SEQUENCE",
    runId: currentRunId,
    slides: [buildSlidePayload(slide)],
  });
}

// ── EXPORT PDF (on demand, from whatever is currently stored) ───────────────

async function exportPdf() {
  if (!currentRunId) return;

  const all = await chrome.storage.local.get(null);
  const prefix = imageKeyPrefix(currentRunId);
  const entries = Object.keys(all)
    .filter((k) => k.startsWith(prefix))
    .map((k) => all[k])
    .sort((a, b) => a.number - b.number);

  if (entries.length === 0) return;

  const pdfDoc = await PDFLib.PDFDocument.create();
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

  for (const entry of entries) {
    const bytes = dataUrlToBytes(entry.dataUrl);
    const image = entry.dataUrl.startsWith("data:image/png")
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes);

    const page = pdfDoc.addPage([image.width, image.height + 40]);
    page.drawRectangle({ x: 0, y: 0, width: image.width, height: 40, color: PDFLib.rgb(0.05, 0.05, 0.05) });
    page.drawImage(image, { x: 0, y: 40, width: image.width, height: image.height });
    page.drawText(`${String(entry.number).padStart(2, "0")} — ${entry.title}`, {
      x: 16,
      y: 12,
      size: 14,
      font,
      color: PDFLib.rgb(1, 1, 1),
    });
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `promptdeck-${currentRunId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── RESET ────────────────────────────────────────────────────────────────────

function reset() {
  slides = [];
  currentRunId = null;
  currentRunStatus = null;
  slideRefs = {};
  saveSlideRefs();
  chrome.storage.local.remove([LAST_MD_KEY, LAST_RUN_KEY]);
  document.getElementById("state-slides").style.display = "none";
  document.getElementById("state-load").style.display = "block";
  document.getElementById("fileInput").value = "";
  document.getElementById("slideCount").textContent = "NO FILE";
  document.getElementById("parseError").style.display = "none";
}
