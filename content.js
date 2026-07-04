/**
 * content.js — PromptDeck
 *
 * Runs on chatgpt.com / chat.openai.com.
 * Asks the background worker for this tab's prompt → waits for
 * ChatGPT's textarea to appear → injects the text and submits it.
 *
 * ChatGPT uses a div[contenteditable] with id="prompt-textarea".
 * We use a layered injection strategy (3 methods) for reliability.
 */

"use strict";

const WAIT_MS    = 15_000;  // Max wait for textarea to appear

// ── ENTRY POINT ──────────────────────────────────────────────────────────────

(async function init() {
  // Only act on a fresh ChatGPT page, not /c/... conversation pages.
  if (window.location.pathname.startsWith("/c/")) return;

  // Ask the service worker for the prompt assigned to THIS tab.
  let resp;
  try {
    resp = await chrome.runtime.sendMessage({ type: "GET_MY_PROMPT" });
  } catch (err) {
    return; // worker not ready / no prompt
  }

  if (!resp || !resp.prompt) return;
  const promptText = resp.prompt;

  // Wait for the textarea, then inject
  const textarea = await waitForTextarea();

  if (!textarea) {
    console.warn("[PromptDeck] textarea not found within timeout");
    return;
  }

  // Small extra delay — let React finish hydrating
  await sleep(400);

  const success = await injectText(textarea, promptText);

  if (success) {
    showBadge();
    await submitPrompt(textarea);
  }
})();

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

function showBadge() {
  const badge = document.createElement("div");
  badge.textContent = "✓ PromptDeck: prompt injected & sent";
  Object.assign(badge.style, {
    position:     "fixed",
    bottom:       "80px",
    right:        "24px",
    zIndex:       "99999",
    background:   "#0C0C0C",
    border:       "1px solid #00E87A",
    color:        "#00E87A",
    fontFamily:   "Inter, system-ui, sans-serif",
    fontSize:     "12px",
    fontWeight:   "600",
    padding:      "10px 16px",
    borderRadius: "4px",
    letterSpacing: "0.3px",
    boxShadow:    "0 4px 16px #00000066",
    opacity:      "1",
    transition:   "opacity 0.4s ease",
  });

  document.body.appendChild(badge);

  // Fade out after 4 seconds
  setTimeout(() => { badge.style.opacity = "0"; }, 4000);
  setTimeout(() => { badge.remove(); }, 4500);
}

// ── UTILS ─────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
