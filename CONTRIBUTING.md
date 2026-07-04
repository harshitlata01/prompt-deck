# Contributing to PromptDeck

Thanks for considering a contribution! This is a small, focused extension —
issues and small, targeted PRs are the easiest to review and merge.

## Development setup

1. Clone the repo.
2. Load it as an unpacked extension: `chrome://extensions` → enable
   **Developer mode** → **Load unpacked** → select the repo folder.
3. After editing `background.js` or `content.js`, click the reload icon on
   the extension's card in `chrome://extensions`. After editing `popup.html`
   or `popup.js`, just reopen the PromptDeck tab.

There's no build step — everything is plain HTML/CSS/JS.

## Regenerating icons

`icons/generate_icons.py` (Python + [Pillow](https://pillow.readthedocs.io/))
regenerates `icons/icon16.png`, `icon48.png`, and `icon128.png` from scratch:

```bash
pip install pillow
python icons/generate_icons.py
```

## Updating the vendored PDF library

`lib/pdf-lib.min.js` is [pdf-lib](https://pdf-lib.js.org/) (MIT), vendored
locally because Manifest V3 forbids loading remote code. To update it:

```bash
curl -sL https://unpkg.com/pdf-lib@<version>/dist/pdf-lib.min.js -o lib/pdf-lib.min.js
curl -sL https://unpkg.com/pdf-lib@<version>/LICENSE.md -o lib/pdf-lib.LICENSE.md
```

Don't hand-edit this file.

## Reporting bugs

Please include:
- Chrome version
- The `.md` file (or a minimal snippet) that triggered the issue
- Which stage failed: parsing (popup), prompt injection, image detection/capture,
  or PDF export — check the on-page badge and the console (`[PromptDeck]` logs)
  in the ChatGPT tab for hints

## Pull requests

- Keep PRs focused on one change.
- Match the existing code style (no build tooling, no framework — plain JS).
- Test the full flow manually (load a script → Start Sequence → confirm a
  slide's prompt lands, its image is captured, and the PDF export works)
  before opening the PR.
