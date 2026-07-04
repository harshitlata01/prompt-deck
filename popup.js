/**
 * popup.js — PromptDeck
 *
 * Flow:
 *   1. User loads .md file
 *   2. parse() splits global design system + each ## SLIDE block
 *   3. Click "→ ChatGPT" on a slide:
 *        a. Ask the background worker to QUEUE_PROMPT
 *        b. Worker opens a chatgpt.com tab, keyed to that prompt by tab id
 *        c. content.js claims its prompt → auto-injects & submits
 */

"use strict";

let slides = [];
let openedSet = new Set();

// Key under which the last-loaded markdown is remembered, so switching or
// closing this tab never forces a re-upload.
const LAST_MD_KEY = "lastMarkdown";

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

document.getElementById("launchAllBtn").addEventListener("click", launchAll);
document.getElementById("resetBtn").addEventListener("click", reset);

// Per-slide "→ ChatGPT" buttons are created dynamically — use delegation.
document.getElementById("slideList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-num]");
  if (!btn) return;
  sendToChat(parseInt(btn.dataset.num, 10));
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
  }

  openedSet = new Set();
  renderSlides();
  showSlidesState();
}

// On load, bring back the last file the user worked with (if any).
(function restoreLastFile() {
  chrome.storage.local.get(LAST_MD_KEY).then((d) => {
    const raw = d[LAST_MD_KEY];
    if (raw) processMarkdown(raw, { restore: true });
  });
})();

// ── RENDER ───────────────────────────────────────────────────────────────────

function showSlidesState() {
  document.getElementById("state-load").style.display = "none";
  document.getElementById("state-slides").style.display = "block";
  document.getElementById("slideCount").textContent = `${slides.length} SLIDES`;
  document.getElementById("slidesTitle").textContent = `${slides.length} SLIDES PARSED`;
}

function renderSlides() {
  const list = document.getElementById("slideList");
  list.innerHTML = "";

  slides.forEach((s) => {
    const done = openedSet.has(s.number);
    const item = document.createElement("div");
    item.className = "slide-item";
    item.id = `item-${s.number}`;
    item.innerHTML = `
      <span class="slide-num">${String(s.number).padStart(2, "0")}</span>
      <span class="slide-title">${escHtml(s.title)}</span>
      <span class="slide-status${done ? " done" : ""}" id="dot-${s.number}"></span>
      <button class="btn-inject${done ? " done" : ""}" id="btn-${s.number}"
              data-num="${s.number}">
        ${done ? "✓ Sent" : "→ ChatGPT"}
      </button>
    `;
    list.appendChild(item);
  });
}

function updateSlideRow(num) {
  const dot = document.getElementById(`dot-${num}`);
  const btn = document.getElementById(`btn-${num}`);
  if (dot) dot.classList.add("done");
  if (btn) { btn.classList.add("done"); btn.textContent = "✓ Sent"; }

  // Update topbar count
  const count = document.getElementById("slideCount");
  count.textContent = `${openedSet.size}/${slides.length} DONE`;
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── SEND TO CHATGPT ──────────────────────────────────────────────────────────

async function sendToChat(num) {
  const slide = slides.find((s) => s.number === num);
  if (!slide) return;

  // The service worker opens a fresh ChatGPT tab and remembers this exact
  // prompt for that tab's id — content.js then claims it (race-free).
  await chrome.runtime.sendMessage({
    type: "QUEUE_PROMPT",
    prompt: slide.combined,
  });

  openedSet.add(num);
  updateSlideRow(num);
}

// ── LAUNCH ALL ───────────────────────────────────────────────────────────────

let launching = false;

async function launchAll() {
  if (launching) return;
  launching = true;

  const btn = document.getElementById("launchAllBtn");
  btn.disabled = true;

  for (let i = 0; i < slides.length; i++) {
    await new Promise((r) => setTimeout(r, 900));
    await sendToChat(slides[i].number);
    btn.textContent = `Opening ${i + 1}/${slides.length}...`;
  }

  setTimeout(() => {
    btn.textContent = "🚀 Inject All into ChatGPT";
    btn.disabled = false;
    launching = false;
  }, 1000);
}

// ── RESET ────────────────────────────────────────────────────────────────────

function reset() {
  slides = [];
  openedSet = new Set();
  chrome.storage.local.remove(LAST_MD_KEY);
  document.getElementById("state-slides").style.display = "none";
  document.getElementById("state-load").style.display = "block";
  document.getElementById("fileInput").value = "";
  document.getElementById("slideCount").textContent = "NO FILE";
  document.getElementById("parseError").style.display = "none";
}
