/**
 * popup.js — PromptDeck
 *
 * Flow:
 *   1. User loads .md file
 *   2. parse() splits global design system + each ## SLIDE block
 *   3. "Start Sequence":
 *        a. Generate a runId, ask the background worker to QUEUE_SEQUENCE
 *           with the full ordered slide list
 *        b. Worker opens ONE chatgpt.com tab and hands it the whole queue
 *        c. content.js drives the entire deck through that one conversation —
 *           inject prompt, wait for the image, capture it, next slide — and
 *           writes live progress + captured images to chrome.storage.local
 *        d. This popup listens for storage changes and updates the slide
 *           list live. When done, content.js auto-builds a PDF; "Export PDF"
 *           here just re-reads whatever images are stored and re-builds it
 *           on demand (e.g. to grab a partial deck, or download it again).
 */

"use strict";

let slides = [];
let currentRunId = null;
let currentRunStatus = null;

// Keys under which state is remembered, so switching or closing this tab
// never forces a re-upload or loses progress on an in-flight run.
const LAST_MD_KEY = "lastMarkdown";
const LAST_RUN_KEY = "promptdeck_last_run";

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
  }

  renderSlides();
  showSlidesState();
}

// On load, bring back the last file the user worked with, then reconnect to
// any run that was already in flight.
(async function restoreOnLoad() {
  const d = await chrome.storage.local.get([LAST_MD_KEY, LAST_RUN_KEY]);
  if (d[LAST_MD_KEY]) processMarkdown(d[LAST_MD_KEY], { restore: true });
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

// ── RENDER ───────────────────────────────────────────────────────────────────

function showSlidesState() {
  document.getElementById("state-load").style.display = "none";
  document.getElementById("state-slides").style.display = "block";
  document.getElementById("slideCount").textContent = `${slides.length} SLIDES`;
  document.getElementById("slidesTitle").textContent = `${slides.length} SLIDES PARSED`;
}

function slideState(num) {
  if (!currentRunStatus) return "pending";
  if ((currentRunStatus.doneNumbers || []).includes(num)) return "done";
  if ((currentRunStatus.failedNumbers || []).includes(num)) return "failed";
  if (currentRunStatus.currentNumber === num && currentRunStatus.phase === "running") return "active";
  return "pending";
}

const STATE_LABEL = {
  pending: "Pending",
  active: "Working…",
  done: "Done",
  failed: "Failed",
};

function renderSlides() {
  const list = document.getElementById("slideList");
  list.innerHTML = "";

  let doneCount = 0;

  slides.forEach((s) => {
    const state = slideState(s.number);
    if (state === "done") doneCount++;

    const item = document.createElement("div");
    item.className = `slide-item ${state}`;
    item.innerHTML = `
      <span class="slide-num">${String(s.number).padStart(2, "0")}</span>
      <span class="slide-title">${escHtml(s.title)}</span>
      <span class="slide-status-text">${STATE_LABEL[state]}</span>
      <span class="slide-dot ${state}"></span>
    `;
    list.appendChild(item);
  });

  const count = document.getElementById("slideCount");
  count.textContent = currentRunStatus ? `${doneCount}/${slides.length} DONE` : `${slides.length} SLIDES`;
}

function updateActionButtons() {
  const startBtn = document.getElementById("startBtn");
  const exportBtn = document.getElementById("exportBtn");

  const running = currentRunStatus && currentRunStatus.phase === "running";
  startBtn.disabled = running;
  startBtn.textContent = running ? "▶ Running…" : "▶ Start Sequence";

  const hasImages = currentRunStatus && (currentRunStatus.doneNumbers || []).length > 0;
  exportBtn.disabled = !hasImages;
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── STORAGE KEY HELPERS (must match content.js) ─────────────────────────────

function runKey(runId) {
  return `promptdeck_run_${runId}`;
}

function imageKeyPrefix(runId) {
  return `promptdeck_img_${runId}_`;
}

function generateRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    slides,
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
  chrome.storage.local.remove([LAST_MD_KEY, LAST_RUN_KEY]);
  document.getElementById("state-slides").style.display = "none";
  document.getElementById("state-load").style.display = "block";
  document.getElementById("fileInput").value = "";
  document.getElementById("slideCount").textContent = "NO FILE";
  document.getElementById("parseError").style.display = "none";
}
