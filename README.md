# PromptDeck

Turn a slide-by-slide Markdown script into one ChatGPT conversation that
generates every slide's image in order — then bundles the results into a PDF.

PromptDeck is a Chrome extension for anyone who scripts out a deck (pitch,
product, proposal) slide-by-slide and then needs a matching image for every
single slide. Instead of pasting a prompt into ChatGPT 20 times and manually
saving each image, you load one `.md` file, click **Start Sequence**, and
PromptDeck drives the whole thing: one conversation, one prompt per slide,
in order, capturing each generated image as it appears — then exports a PDF
automatically once the deck is done.

It pairs naturally with the included [`ppt-script` Claude Skill](skills/ppt-script/SKILL.md),
which turns a rough idea into a properly structured deck script in the first
place — but PromptDeck works with any Markdown file that follows the format
below, however you produce it.

---

## How it fits together

```
 1. Claude (ppt-script skill)      2. PromptDeck (this extension)             3. ChatGPT
 ───────────────────────────       ─────────────────────────────────         ──────────────
 "Write a deck script      ──▶     Load the .md, click Start Sequence ──▶    One conversation:
 for..." generates a               PromptDeck injects each slide's           each prompt sent,
 structured .md file:               prompt in turn, waits for its             its image awaited,
 design system + one                image, captures it, moves on             then the next slide
 ## SLIDE section each                                                       │
                                                                              ▼
                                    PDF auto-downloads       ◀───────  all slides captured
```

You only need PromptDeck to use the extension. The skill is there so the
`.md` input is easy to produce and stays consistently formatted across decks.

---

## Install the extension

PromptDeck isn't on the Chrome Web Store — install it as an unpacked
extension:

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the repository folder.
5. Pin the PromptDeck icon to your toolbar.

Click the toolbar icon any time to open the PromptDeck tab.

---

## Usage

### 1. Get a deck script (`.md` file)

A deck script is a single Markdown file with:

- A **global design system** (colors, typography, layout rules) defined once
- One `## SLIDE 01 — TITLE`, `## SLIDE 02 — TITLE`, … section per slide, each
  with its own headline, copy, and a detailed visual brief

See [`examples/sample-deck-script.md`](examples/sample-deck-script.md) for a
complete 3-slide example, or read the full spec in
[`skills/ppt-script/SKILL.md`](skills/ppt-script/SKILL.md).

The fastest way to produce one: hand the `ppt-script` skill to Claude (see
[Using the included skill](#using-the-included-skill) below) and ask it to
write a deck script for your presentation. You can also write one by hand
following the same structure.

### 2. Load it into PromptDeck

Click the PromptDeck toolbar icon, then drag your `.md` file onto the drop
zone (or click to browse). PromptDeck parses it into a list of slides.

### 3. Start the sequence

Click **Start Sequence**. PromptDeck opens one ChatGPT tab and, in that
single conversation:

1. Injects the first slide's prompt and submits it.
2. Watches for the generated image to actually appear and finish loading.
3. Captures it, then injects the next slide's prompt into the same
   conversation — and so on, in order, until every slide is done.

Each slide's prompt is:

```
generate Image

<the deck's global design system>

---

<that slide's section — layout, headline, visual brief, etc.>
```

The PromptDeck tab shows live status per slide (pending / working / done /
failed) so you can watch progress without babysitting the ChatGPT tab. If a
slide's image doesn't show up in time, PromptDeck marks it failed and moves
on to the next slide rather than stalling the whole deck.

### 4. Get your PDF

Once the last slide finishes, PromptDeck automatically assembles every
captured image into a PDF (one slide per page, labeled with its number and
title) and downloads it. You can also click **Export PDF** at any time —
during or after a run — to (re)download a PDF of whatever's been captured
so far.

---

## Reference images (logos, product shots, etc.)

If a slide needs to reproduce something specific — your logo, a product
photo, a founder headshot — a text description alone won't get it right.
PromptDeck lets you upload named reference images and attach them to
specific slides:

1. In the **Reference images** panel, click **Add**, pick an image, and give
   it a short name (e.g. `Logo`).
2. On any slide, click **+ Reference** and check off which saved reference(s)
   apply to that slide (a slide can use more than one).
3. When that slide's prompt is sent, PromptDeck uploads the actual image
   file into ChatGPT's composer as a real attachment (not just a text
   description) and appends a line like `Use the attached reference image —
   image of Logo given in reference as Logo.` to the prompt.

The reference image **library** persists across different decks — load a
new `.md` file next week and your saved `Logo` is still there to attach
again. Per-slide *attachments* are specific to the currently loaded deck and
reset when you load a different file.

---

## Using the included skill

[`skills/ppt-script/SKILL.md`](skills/ppt-script/SKILL.md) is a
[Claude Skill](https://docs.claude.com/en/docs/claude-code/skills) that
teaches Claude the exact Markdown format PromptDeck expects: a global design
system followed by one structured section per slide.

To use it with **Claude Code**:

```bash
mkdir -p .claude/skills
cp -r skills/ppt-script .claude/skills/ppt-script
```

Then, in Claude Code, just ask for what you want:

> Write a deck script for a 5-slide investor pitch about [your product].

Claude will produce a `.md` file following the format — drop that straight
into PromptDeck.

The same `SKILL.md` also works as a standalone prompt: paste its contents
into any Claude conversation (claude.ai, the API, etc.) before asking for a
deck script, if you're not using Claude Code.

---

## How image capture & PDF export work

- **Detecting a finished image**: rather than trying to track ChatGPT's
  stop/regenerate button state (a moving target that changes with every UI
  update), PromptDeck polls the DOM for a new `<img>` large enough to be a
  generated slide (not an avatar or icon) and waits for it to finish loading.
  Candidates are restricted to images inside an **assistant**-authored turn
  (via ChatGPT's `data-message-author-role` message markers) — this both
  scopes detection to the current slide's own turn (so a previous slide's
  image finishing late can't get mistaken for the current one) and excludes
  images inside the **user's** own turn (so an attached reference image,
  which ChatGPT echoes back as a thumbnail in the user's message bubble, is
  never mistaken for the generated result). If nothing shows up within 3
  minutes, that slide is marked **No capture** (the prompt was sent fine —
  PromptDeck just couldn't confirm/save an image for it) and the sequence
  continues with the next prompt rather than stalling the whole deck.
- **Capturing the image**: PromptDeck first tries fetching the image's bytes
  directly; if that's blocked by cross-origin restrictions, it falls back to
  drawing the already-rendered `<img>` onto a canvas. Captured images are
  written to `chrome.storage.local` (the `unlimitedStorage` permission is
  used specifically so a multi-slide deck's images don't hit the default 10MB
  quota).
- **Attaching reference images**: uploading a saved reference into ChatGPT's
  composer is done by assigning a synthetic `DataTransfer`'s `FileList` to
  the composer's `input[type="file"]` and dispatching a `change` event —
  the same trick userscripts use to script file inputs programmatically.
- **Building the PDF**: done entirely client-side with the vendored
  [pdf-lib](https://pdf-lib.js.org/) (`lib/pdf-lib.min.js`, MIT-licensed —
  see [`lib/pdf-lib.LICENSE.md`](lib/pdf-lib.LICENSE.md)). Manifest V3 forbids
  loading remote code, so this is bundled locally rather than pulled from a
  CDN at runtime.

This whole pipeline depends on ChatGPT's current DOM structure, same as the
prompt-injection code — if OpenAI changes their markup, the image detector,
attachment, or injection methods may need updating.

---

## Why one conversation instead of one tab per slide?

Earlier versions of PromptDeck opened a new ChatGPT tab per slide. Driving
the whole deck through a single conversation instead is simpler and more
robust: there's no per-tab bookkeeping race in the background worker, the
generated images end up in one place in the right order, and that made
automatic PDF assembly straightforward.

---

## Project structure

```
manifest.json              Chrome extension manifest (MV3)
background.js               Service worker — opens the ChatGPT tab, hands off the slide queue
content.js                   Runs on chatgpt.com — injects prompts, detects & captures images, exports PDF
popup.html / popup.js        The PromptDeck UI (opened as a full tab) + on-demand PDF export
lib/pdf-lib.min.js            Vendored PDF library (MIT) used for PDF assembly
icons/                       Extension icons + the script that generated them
skills/ppt-script/SKILL.md   Claude Skill for authoring deck scripts
examples/                    Sample deck script you can load immediately
```

---

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) for PromptDeck itself. The vendored `lib/pdf-lib.min.js` is
MIT-licensed separately by its authors — see
[`lib/pdf-lib.LICENSE.md`](lib/pdf-lib.LICENSE.md).
