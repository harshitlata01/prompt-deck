/**
 * background.js — PromptDeck (service worker)
 *
 * Why this exists:
 *   - content scripts cannot read chrome.storage.session, and a single shared
 *     "pending" key races when many tabs open at once. Since v1.1 there is
 *     only ever one ChatGPT tab per run (the whole deck is injected
 *     sequentially into one conversation), but the same tabId-keyed handoff
 *     is kept so a fresh content script knows exactly which run it owns.
 *   - The service worker creates the ChatGPT tab itself, so it can remember
 *     which run belongs to which tab id. The content script then asks
 *     "what's my run?" once, and drives the rest of the sequence itself.
 */

"use strict";

// tabId -> { runId, slides }, in memory. Mirrored to storage.local so an
// evicted worker can still recover it.
const pending = new Map();

// The extension has no popup any more. Clicking the toolbar icon opens the
// engine as a full browser tab (which — unlike a popup — is NOT destroyed when
// focus moves to a ChatGPT tab, so a running sequence and file state both
// survive).
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
  // From popup: open a fresh ChatGPT tab and remember its whole slide queue.
  if (msg && msg.type === "QUEUE_SEQUENCE") {
    chrome.tabs
      .create({ url: "https://chatgpt.com/" })
      .then(async (tab) => {
        const payload = { runId: msg.runId, slides: msg.slides };
        pending.set(tab.id, payload);
        await chrome.storage.local.set({ ["seq_" + tab.id]: payload });
        sendResponse({ ok: true, tabId: tab.id });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // keep the channel open for the async reply
  }

  // From content script: hand over (and forget) this tab's queue.
  if (msg && msg.type === "GET_MY_QUEUE") {
    const tabId = sender.tab && sender.tab.id;
    if (tabId == null) {
      sendResponse({ runId: null, slides: null });
      return true;
    }

    const give = (payload) => {
      pending.delete(tabId);
      chrome.storage.local.remove("seq_" + tabId);
      sendResponse(payload || { runId: null, slides: null });
    };

    if (pending.has(tabId)) {
      give(pending.get(tabId));
    } else {
      // Worker may have restarted — fall back to persisted copy.
      chrome.storage.local.get("seq_" + tabId).then((d) => give(d["seq_" + tabId]));
    }
    return true;
  }

  return false;
});

// Tidy up if a queued tab is closed before its run was claimed.
chrome.tabs.onRemoved.addListener((tabId) => {
  pending.delete(tabId);
  chrome.storage.local.remove("seq_" + tabId);
});
