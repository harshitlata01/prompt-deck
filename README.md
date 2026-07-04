# PromptDeck

Turn a slide-by-slide Markdown script into a queue of image-generation prompts,
auto-injected into ChatGPT — one tab per slide, no copy-pasting.

PromptDeck is a Chrome extension for anyone who scripts out a deck (pitch,
product, proposal) slide-by-slide and then needs to generate a matching image
for every single slide in ChatGPT. Instead of opening a new chat and pasting
a prompt 20 times, you load one `.md` file and let PromptDeck open and fill
each tab for you.

It pairs naturally with the included [`ppt-script` Claude Skill](skills/ppt-script/SKILL.md),
which turns a rough idea into a properly structured deck script in the first
place — but PromptDeck works with any Markdown file that follows the format
below, however you produce it.

---

## How it fits together

```
 1. Claude (with the ppt-script skill)      2. PromptDeck (this extension)        3. ChatGPT
 ─────────────────────────────────          ───────────────────────────────       ─────────────
 "Write a deck script for..."       ──▶     Load the .md file            ──▶      One tab opens
 generates a structured .md                 Click a slide, or                     per slide, prompt
 file: global design system +               "Inject All"                         is typed & sent
 one ## SLIDE section per slide                                                   automatically
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

### 3. Send prompts to ChatGPT

- Click **→ ChatGPT** next to any slide to open a fresh ChatGPT tab and
  auto-inject + submit that slide's image prompt.
- Click **Inject All** to do this for every slide in sequence, each in its
  own tab.

Each slide's prompt is:

```
generate Image

<the deck's global design system>

---

<that slide's section — layout, headline, visual brief, etc.>
```

PromptDeck tracks which slides have already been sent (a green dot + "✓ Sent")
so you can safely reopen the extension mid-deck without resending everything.

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

## Why per-tab prompt queueing?

Chrome's `chrome.storage.session` only holds one shared value, which races
when several ChatGPT tabs are opened back-to-back via "Inject All". PromptDeck's
background service worker opens each tab itself and remembers which prompt
belongs to which tab ID, so every tab reliably gets its own slide — even when
several are opened within milliseconds of each other.

---

## Project structure

```
manifest.json              Chrome extension manifest (MV3)
background.js               Service worker — opens tabs, tracks prompt-per-tab
content.js                   Runs on chatgpt.com — injects & submits the prompt
popup.html / popup.js        The PromptDeck UI (opened as a full tab)
icons/                       Extension icons + the script that generated them
skills/ppt-script/SKILL.md   Claude Skill for authoring deck scripts
examples/                    Sample deck script you can load immediately
```

---

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
