/**
 * background.js — PromptDeck (service worker)
 *
 * Why this exists:
 *   - content scripts cannot read chrome.storage.session, and a single shared
 *     "pendingPrompt" key races when many tabs open at once ("Inject All").
 *   - The service worker creates each ChatGPT tab itself, so it can remember
 *     which prompt belongs to which tab id. Each content script then asks
 *     "what's my prompt?" and gets exactly the right one.
 */

"use strict";

// tabId -> prompt, in memory. Mirrored to storage.local so an evicted worker
// can still recover it.
const pending = new Map();

// The extension has no popup any more. Clicking the toolbar icon opens the
// engine as a full browser tab (which — unlike a popup — is NOT destroyed when
// focus moves to a ChatGPT tab, so "Inject All" and file state both survive).
const APP_URL = chrome.runtime.getURL("popup.html");

chrome.action.onClicked.addListener(async () => {
  // Reuse an already-open engine tab instead of piling up duplicates.
  const existing = await chrome.tabs.query({ url: APP_URL });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: APP_URL });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // From popup: open a fresh ChatGPT tab and remember its prompt.
  if (msg && msg.type === "QUEUE_PROMPT") {
    chrome.tabs
      .create({ url: "https://chatgpt.com/" })
      .then(async (tab) => {
        pending.set(tab.id, msg.prompt);
        await chrome.storage.local.set({ ["prompt_" + tab.id]: msg.prompt });
        sendResponse({ ok: true, tabId: tab.id });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // keep the channel open for the async reply
  }

  // From content script: hand over (and forget) this tab's prompt.
  if (msg && msg.type === "GET_MY_PROMPT") {
    const tabId = sender.tab && sender.tab.id;
    if (tabId == null) {
      sendResponse({ prompt: null });
      return true;
    }

    const give = (prompt) => {
      pending.delete(tabId);
      chrome.storage.local.remove("prompt_" + tabId);
      sendResponse({ prompt: prompt || null });
    };

    if (pending.has(tabId)) {
      give(pending.get(tabId));
    } else {
      // Worker may have restarted — fall back to persisted copy.
      chrome.storage.local
        .get("prompt_" + tabId)
        .then((d) => give(d["prompt_" + tabId]));
    }
    return true;
  }

  return false;
});

// Tidy up if a queued tab is closed before its prompt was claimed.
chrome.tabs.onRemoved.addListener((tabId) => {
  pending.delete(tabId);
  chrome.storage.local.remove("prompt_" + tabId);
});
