/**
 * content.js — PromptDeck
 *
 * Runs on chatgpt.com / chat.openai.com.
 * Claims this tab's slide queue from the background worker, then drives the
 * whole deck through ONE conversation: inject a slide's prompt, wait for its
 * generated image to actually appear and finish loading, capture it, then
 * move on to the next slide's prompt in the same textarea. When every slide
 * is done, it assembles the captured images into a PDF and downloads it.
 *
 * ChatGPT uses a div[contenteditable] with id="prompt-textarea". We use a
 * layered injection strategy (3 methods) for reliability, and a polling
 * "image detector" (rather than trying to track ChatGPT's stop/regenerate
 * button state, which is a moving target) to know when a slide's image is
 * ready.
 */

"use strict";

const WAIT_MS          = 15_000;  // Max wait for textarea to appear
const IMAGE_TIMEOUT_MS = 90_000;  // Max wait for a slide's image to render
const IMAGE_POLL_MS    = 700;     // Polling interval for the image detector
const MIN_IMAGE_PX     = 200;     // Below this, treat an <img> as UI chrome, not a generated slide

// ── ENTRY POINT ──────────────────────────────────────────────────────────────

(async function init() {
  // Only act on a fresh ChatGPT page, not /c/... conversation pages opened
  // manually (this guard only applies to a fresh page load / script inject —
  // once we're driving a run, in-page SPA navigation to /c/<id> does not
  // re-run this script, so the sequence keeps going).
  if (window.location.pathname.startsWith("/c/")) return;

  let resp;
  try {
    resp = await chrome.runtime.sendMessage({ type: "GET_MY_QUEUE" });
  } catch (err) {
    return; // worker not ready / no queue
  }

  if (!resp || !resp.runId || !resp.slides || resp.slides.length === 0) return;

  await runSequence(resp.runId, resp.slides);
})();

// ── SEQUENCE DRIVER ──────────────────────────────────────────────────────────

async function runSequence(runId, slides) {
  await setRunStatus(runId, {
    total: slides.length,
    doneNumbers: [],
    failedNumbers: [],
    phase: "running",
  });

  for (const slide of slides) {
    await setRunStatus(runId, { currentNumber: slide.number, currentPhase: "sending" });

    const textarea = await waitForTextarea();
    if (!textarea) {
      console.warn("[PromptDeck] textarea not found — aborting sequence");
      await setRunStatus(runId, { phase: "error", currentPhase: "error" });
      return;
    }

    await sleep(400); // let React finish hydrating

    const injected = await injectText(textarea, slide.combined);
    if (!injected) {
      await markSlideOutcome(runId, slide.number, false);
      showBadge(`✕ Slide ${slide.number}: couldn't inject prompt`, "fail");
      continue;
    }

    await submitPrompt(textarea);
    await setRunStatus(runId, { currentPhase: "waiting-image" });
    showBadge(`Slide ${slide.number} sent — waiting for image…`, "info");

    const imgEl = await waitForGeneratedImage(IMAGE_TIMEOUT_MS);
    if (!imgEl) {
      await markSlideOutcome(runId, slide.number, false);
      showBadge(`✕ Slide ${slide.number}: no image detected in time`, "fail");
      await sleep(1200);
      continue;
    }

    const dataUrl = await captureImage(imgEl);
    if (!dataUrl) {
      await markSlideOutcome(runId, slide.number, false);
      showBadge(`✕ Slide ${slide.number}: image found but couldn't be saved`, "fail");
      await sleep(1200);
      continue;
    }

    await chrome.storage.local.set({
      [imageKey(runId, slide.number)]: { number: slide.number, title: slide.title, dataUrl },
    });
    await markSlideOutcome(runId, slide.number, true);
    showBadge(`✓ Slide ${slide.number} image captured`, "success");

    await sleep(1200); // let the UI settle before the next prompt
  }

  await setRunStatus(runId, { phase: "complete", currentPhase: "done" });

  try {
    await exportPdf(runId);
  } catch (err) {
    console.error("[PromptDeck] auto PDF export failed:", err);
  }
}

async function markSlideOutcome(runId, number, ok) {
  const key = runKey(runId);
  const cur = (await chrome.storage.local.get(key))[key] || { doneNumbers: [], failedNumbers: [] };
  const doneNumbers = cur.doneNumbers || [];
  const failedNumbers = cur.failedNumbers || [];
  if (ok) doneNumbers.push(number);
  else failedNumbers.push(number);
  await setRunStatus(runId, { doneNumbers, failedNumbers });
}

// ── STORAGE HELPERS ──────────────────────────────────────────────────────────

function runKey(runId) {
  return `promptdeck_run_${runId}`;
}

function imageKey(runId, number) {
  return `promptdeck_img_${runId}_${String(number).padStart(3, "0")}`;
}

async function setRunStatus(runId, patch) {
  const key = runKey(runId);
  const cur = (await chrome.storage.local.get(key))[key] || {};
  await chrome.storage.local.set({ [key]: { ...cur, ...patch, updatedAt: Date.now() } });
}

// ── PDF EXPORT ───────────────────────────────────────────────────────────────

async function exportPdf(runId) {
  if (typeof PDFLib === "undefined") {
    console.warn("[PromptDeck] PDFLib not loaded — skipping PDF export");
    return;
  }

  const all = await chrome.storage.local.get(null);
  const entries = Object.keys(all)
    .filter((k) => k.startsWith(`promptdeck_img_${runId}_`))
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
  a.download = `promptdeck-${runId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  showBadge(`✓ PDF exported — ${entries.length} slide${entries.length === 1 ? "" : "s"}`, "success");
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── IMAGE DETECTOR ───────────────────────────────────────────────────────────

function isCandidateImage(img) {
  return (
    img.tagName === "IMG" &&
    img.src &&
    !img.src.startsWith("data:") &&
    img.naturalWidth >= MIN_IMAGE_PX &&
    img.naturalHeight >= MIN_IMAGE_PX
  );
}

function waitForGeneratedImage(timeoutMs) {
  const before = new Set(document.querySelectorAll("img"));

  return new Promise((resolve) => {
    const start = Date.now();

    const poll = () => {
      const found = Array.from(document.querySelectorAll("img")).find(
        (img) => !before.has(img) && isCandidateImage(img)
      );
      if (found) {
        resolve(found);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(poll, IMAGE_POLL_MS);
    };

    poll();
  });
}

async function captureImage(imgEl) {
  // Method 1: fetch the bytes directly (works for same-origin and for
  // cross-origin hosts covered by this extension's host_permissions).
  try {
    const res = await fetch(imgEl.src);
    const blob = await res.blob();
    if (blob && blob.type.startsWith("image/")) {
      return await blobToDataUrl(blob);
    }
  } catch (err) {
    // fall through to canvas capture
  }

  // Method 2: draw the already-loaded <img> to a canvas. Only works if the
  // image wasn't loaded in a way that taints the canvas (cross-origin
  // without permissive headers).
  try {
    const canvas = document.createElement("canvas");
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgEl, 0, 0);
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.error("[PromptDeck] image capture failed:", err);
    return null;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── SUBMIT ───────────────────────────────────────────────────────────────────

async function submitPrompt(el) {
  // React needs a moment to enable the send button after the text lands.
  for (let i = 0; i < 10; i++) {
    const btn =
      document.querySelector('button[data-testid="send-button"]') ||
      document.querySelector('button[aria-label*="Send" i]');
    if (btn && !btn.disabled) {
      btn.click();
      return;
    }
    await sleep(200);
  }

  // Fallback: press Enter inside the textarea.
  const opts = { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 };
  el.dispatchEvent(new KeyboardEvent("keydown", opts));
  el.dispatchEvent(new KeyboardEvent("keyup", opts));
}

// ── WAIT FOR TEXTAREA ────────────────────────────────────────────────────────

function waitForTextarea() {
  return new Promise((resolve) => {
    // Already exists?
    const existing = getTextarea();
    if (existing) return resolve(existing);

    // Watch DOM for it
    const observer = new MutationObserver(() => {
      const el = getTextarea();
      if (el) {
        observer.disconnect();
        clearTimeout(timeout);
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const timeout = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, WAIT_MS);
  });
}

function getTextarea() {
  // ChatGPT's primary selector (stable as of 2025)
  return (
    document.getElementById("prompt-textarea") ||
    document.querySelector("div[contenteditable='true'][data-testid]") ||
    document.querySelector("div[contenteditable='true']")
  );
}

// ── INJECTION ────────────────────────────────────────────────────────────────

async function injectText(el, text) {
  try {
    el.focus();
    await sleep(100);

    // ── Method 1: execCommand (works with React's synthetic events in most browsers) ──
    // Select all + delete any existing text first
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);

    const inserted = document.execCommand("insertText", false, text);

    if (inserted && el.textContent.trim() === text.trim()) {
      return true;
    }

    // ── Method 2: Simulate a paste event ──
    const dt = new DataTransfer();
    dt.setData("text/plain", text);

    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      })
    );

    await sleep(150);

    if (el.textContent.trim().length > 50) return true;

    // ── Method 3: Direct innerHTML + React synthetic input event ──
    el.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = text;
    el.appendChild(p);

    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: text,
      })
    );

    await sleep(150);
    return el.textContent.trim().length > 0;

  } catch (err) {
    console.error("[PromptDeck] injection error:", err);
    return false;
  }
}

// ── VISUAL BADGE ─────────────────────────────────────────────────────────────

const BADGE_COLORS = {
  info:    "#22D3EE",
  success: "#00E87A",
  fail:    "#FF4D4D",
};

function showBadge(text, tone = "success") {
  const color = BADGE_COLORS[tone] || BADGE_COLORS.success;

  const badge = document.createElement("div");
  badge.textContent = text;
  Object.assign(badge.style, {
    position:     "fixed",
    bottom:       "80px",
    right:        "24px",
    zIndex:       "99999",
    background:   "#0C0C0C",
    border:       `1px solid ${color}`,
    color,
    fontFamily:   "Inter, system-ui, sans-serif",
    fontSize:     "12px",
    fontWeight:   "600",
    padding:      "10px 16px",
    borderRadius: "8px",
    letterSpacing: "0.3px",
    opacity:      "1",
    transition:   "opacity 0.4s ease",
    maxWidth:     "320px",
  });

  document.body.appendChild(badge);

  setTimeout(() => { badge.style.opacity = "0"; }, 4000);
  setTimeout(() => { badge.remove(); }, 4500);
}

// ── UTILS ─────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
