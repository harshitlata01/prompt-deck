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

const WAIT_MS          = 15_000;   // Max wait for textarea to appear
const IMAGE_TIMEOUT_MS = 180_000;  // Max wait for a slide's image to render
const IMAGE_POLL_MS    = 700;      // Polling interval for the image detector
const MIN_IMAGE_PX     = 200;      // Below this, treat an <img> as UI chrome, not a generated slide

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
  // A manual per-slide retry reuses the deck's runId with a 1-item queue —
  // preserve the deck's real total and any earlier results instead of
  // wiping them out.
  const existing = (await chrome.storage.local.get(runKey(runId)))[runKey(runId)] || {};
  await setRunStatus(runId, {
    total: existing.total || slides.length,
    doneNumbers: existing.doneNumbers || [],
    failedNumbers: existing.failedNumbers || [],
    noCaptureNumbers: existing.noCaptureNumbers || [],
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

    if (slide.references && slide.references.length > 0) {
      showBadge(
        `Attaching ${slide.references.length} reference image${slide.references.length === 1 ? "" : "s"}…`,
        "info"
      );
      await attachReferenceImages(slide.references);
    }

    const injected = await injectText(textarea, slide.combined);
    if (!injected) {
      await markSlideOutcome(runId, slide.number, "failed");
      showBadge(`✕ Slide ${slide.number}: couldn't inject prompt`, "fail");
      continue;
    }

    const priorUserTurns = getUserTurns().length;
    await submitPrompt(textarea);
    await setRunStatus(runId, { currentPhase: "waiting-image" });
    showBadge(`Slide ${slide.number} sent — waiting for image…`, "info");

    // Scope image detection to THIS slide's own turn. Without this, a
    // previous slide's image that finishes rendering late (after we'd
    // already given up on it) can get mistaken for the current slide's
    // image, since both are just "some new <img> that showed up."
    const myTurn = await waitForOwnUserTurn(priorUserTurns);

    const imgEl = await waitForGeneratedImage(IMAGE_TIMEOUT_MS, myTurn);
    if (!imgEl) {
      // The prompt was sent fine — ChatGPT may still be working, or already
      // rendered an image our detector didn't recognize. Not a hard failure.
      await markSlideOutcome(runId, slide.number, "no-capture");
      showBadge(`Slide ${slide.number}: no image confirmed — check the chat`, "warn");
      await sleep(1200);
      continue;
    }

    const dataUrl = await captureImage(imgEl);
    if (!dataUrl) {
      await markSlideOutcome(runId, slide.number, "no-capture");
      showBadge(`Slide ${slide.number}: image seen but couldn't be saved`, "warn");
      await sleep(1200);
      continue;
    }

    await chrome.storage.local.set({
      [imageKey(runId, slide.number)]: { number: slide.number, title: slide.title, dataUrl },
    });
    await markSlideOutcome(runId, slide.number, "done");
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

async function markSlideOutcome(runId, number, outcome) {
  const key = runKey(runId);
  const cur = (await chrome.storage.local.get(key))[key] || {};
  const strip = (arr) => (arr || []).filter((n) => n !== number);

  const doneNumbers = strip(cur.doneNumbers);
  const failedNumbers = strip(cur.failedNumbers);
  const noCaptureNumbers = strip(cur.noCaptureNumbers);

  if (outcome === "done") doneNumbers.push(number);
  else if (outcome === "no-capture") noCaptureNumbers.push(number);
  else failedNumbers.push(number);

  await setRunStatus(runId, { doneNumbers, failedNumbers, noCaptureNumbers });
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
  if (img.tagName !== "IMG" || !img.src || img.src.startsWith("data:")) return false;
  if (img.naturalWidth < MIN_IMAGE_PX || img.naturalHeight < MIN_IMAGE_PX) return false;

  // Exclude images that belong to a USER-authored turn. When a slide has an
  // attached reference image, ChatGPT echoes it as a thumbnail inside the
  // user's own message bubble once sent — that thumbnail is a real, large
  // <img> that appears almost instantly, and was getting mistaken for the
  // generated result (causing the sequence to "finish" a slide in ~2 seconds
  // and move on to the next prompt while the real generation was still
  // running). Only images inside an ASSISTANT turn are ever candidates.
  const turn = img.closest("[data-message-author-role]");
  if (turn && turn.getAttribute("data-message-author-role") === "user") return false;

  return true;
}

// ChatGPT tags each message group with data-message-author-role="user" or
// "assistant". We use the user-turn markers to know exactly which slide a
// given image belongs to — without this, a PREVIOUS slide's image finishing
// late (after we'd already given up waiting on it) can be mistaken for the
// CURRENT slide's image, since both are just "some new <img> that showed up."
function getUserTurns() {
  return Array.from(document.querySelectorAll('[data-message-author-role="user"]'));
}

function waitForOwnUserTurn(priorCount, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const poll = () => {
      const turns = getUserTurns();
      if (turns.length > priorCount) {
        resolve(turns[turns.length - 1]);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(null); // selector didn't match this ChatGPT UI version — degrade gracefully
        return;
      }
      setTimeout(poll, 300);
    };
    poll();
  });
}

function isAfterNode(node, referenceNode) {
  if (!referenceNode) return true; // no scoping available — fall back to unscoped search
  return !!(referenceNode.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
}

// ChatGPT sometimes inserts a placeholder <img> immediately and swaps its
// `src` once generation finishes, rather than appending a brand-new element.
// So "the image is ready" has to mean either "a new candidate element
// appeared" OR "the last candidate element's src changed" — watching only
// for new elements misses the swap case and times out even though the image
// rendered fine.
function waitForGeneratedImage(timeoutMs, afterNode) {
  const candidates = () =>
    Array.from(document.querySelectorAll("img"))
      .filter(isCandidateImage)
      .filter((img) => isAfterNode(img, afterNode));

  const baseline = candidates();
  const baselineCount = baseline.length;
  const baselineLast = baseline.length ? baseline[baseline.length - 1] : null;
  const baselineSrc = baselineLast ? baselineLast.src : null;

  return new Promise((resolve) => {
    const start = Date.now();

    const poll = () => {
      const list = candidates();
      const last = list.length ? list[list.length - 1] : null;

      const isNew =
        last &&
        (list.length > baselineCount || last !== baselineLast || last.src !== baselineSrc);

      if (last && isNew && last.complete && last.naturalWidth > 0) {
        resolve(last);
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

// ── REFERENCE IMAGE ATTACHMENT ───────────────────────────────────────────────
// Uploads saved reference images (logos, product shots, etc.) into ChatGPT's
// composer before the prompt text is typed, so they ride along as real
// attachments in the message rather than just being described in words.

async function attachReferenceImages(references) {
  const input = document.querySelector('input[type="file"]');
  if (!input) {
    console.warn("[PromptDeck] no file input found — skipping reference image attachment");
    showBadge("Couldn't find ChatGPT's attach control — sending without reference images", "warn");
    return false;
  }

  try {
    const dt = new DataTransfer();
    for (const ref of references) {
      const res = await fetch(ref.dataUrl);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "png").split("+")[0];
      dt.items.add(new File([blob], `${sanitizeFilename(ref.name)}.${ext}`, { type: blob.type }));
    }

    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    // Give ChatGPT time to show the attachment thumbnail(s) and finish
    // uploading before we type the caption and hit send.
    await sleep(1200 + references.length * 1500);
    return true;
  } catch (err) {
    console.error("[PromptDeck] reference image attach failed:", err);
    showBadge("Reference image attach failed — sending without it", "warn");
    return false;
  }
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40) || "reference";
}

// ── SUBMIT ───────────────────────────────────────────────────────────────────

async function submitPrompt(el) {
  // React needs a moment to enable the send button after the text lands
  // (attachments in flight can make this take a little longer).
  for (let i = 0; i < 25; i++) {
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
  warn:    "#F5C242",
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
