---
name: ppt-script
description: Create professionally formatted PPT script + design guide .md files — a structured format that works as both a copywriter brief (what each slide says) and a design brief (exactly what each slide looks like). Use this skill whenever asked to write, create, produce, or draft a PPT script, presentation script, deck script, slide script, or design guide document. Trigger on phrases like "write a ppt script", "deck script for", "slide script", "presentation script", "make a script for a deck", "script the slides", or any request to produce a scripted slide-by-slide .md document for a pitch, proposal, product deck, or client presentation. The output must follow the PPT Script Format defined in this skill — global design system block, per-slide sections, appendix — so it can be handed directly to a designer or downstream design tool.
---

# PPT Script Format

A standardized `.md` format for pitch decks, proposals, and product presentations. Every file produced by this skill is both a **copywriter brief** (what each slide says) and a **design brief** (exactly what each slide looks like). The output is meant to be handed directly to a designer or a design tool — precision matters more than prose.

This format is style-agnostic. It does not assume any particular color palette, illustration style, or brand. Section 2 (Global Design System) is where *you* define the visual identity for a given deck — fill it in once per project, then every slide brief inherits from it.

---

## Document Structure

Every PPT script `.md` file has exactly **four top-level sections**:

```
1. DOCUMENT HEADER
2. GLOBAL DESIGN SYSTEM
3. SLIDES (one ## section per slide)
4. APPENDIX
```

---

## Section 1 — Document Header

```markdown
# [PROJECT / PRODUCT]: [DECK TITLE] — PPT SCRIPT + DESIGN GUIDE v[N]
### [Audience / Client Name] · [Confidentiality level, if any] · [REF_CODE]
### Design System: [Background] · [Illustration style] · [Visual tone]
```

**Rules:**
- Project/product name in ALL CAPS, deck title in title case
- Version number increments per revision (v1, v2, v3…)
- `REF_CODE` is optional — a short internal reference code, useful when producing many decks for many audiences (e.g. `PROJ_A01`). Drop the line entirely if you don't need one.
- Design system one-liner states the three core visual principles on a single line, so anyone opening the file gets the gist before reading Section 2

---

## Section 2 — Global Design System

This section appears once at the top of every deck. It defines the rules that govern every slide. **Do not skip or abbreviate it** — this is what keeps 20 slides visually consistent instead of 20 one-off designs.

Structure:

```
### Philosophy
[2–3 sentence description of the visual philosophy — what the design IS and what it ISN'T]

---

### Color Palette
[Markdown table — see format below]

---

### Typography
[Markdown table — see format below]

---

### Illustration / Imagery System
[Core rules, how color is used in illustrations or imagery, component definitions, background treatment, weight/hierarchy rules]

---

### Slide Layout Grid
[Canvas dimensions, safe margins, bottom bar spec, section tag position]
```

### Color Palette Table Format

```markdown
| Token | Hex | Use |
|---|---|---|
| Background | `#HEXHEX` | Slide base |
| Surface | `#HEXHEX` | Card backgrounds, inset panels |
| Surface-alt | `#HEXHEX` | Alternate tiles, hover state |
| Border | `#HEXHEX` | Subtle card borders |
| Text-primary | `#HEXHEX` | Headlines, all-caps labels |
| Text-muted | `#HEXHEX` | Supporting text, footnotes |
| [Signal color] | `#HEXHEX` | [Semantic use — pick a meaning and keep it fixed, e.g. "in-progress / technical"] |
| [State: Positive] | `#HEXHEX` | [Confirmed states, success, resolution] |
| [State: Negative] | `#HEXHEX` | [Failure modes, problems, pain points] |
| Brand Accent | `#HEXHEX` | [Your own brand color — CTA, section tags, logo] |
| Partner Accent | `#HEXHEX` | [Optional: a client/partner's brand color, if this deck is for them] |
```

**Guidelines for defining a palette:**
- Pick 3–5 semantic colors and *fix their meaning* for the whole deck (e.g. "green always means resolved, red always means a problem"). Never reassign a semantic color mid-deck.
- `Brand Accent` is your own identity — it should appear consistently (logo, section tags, CTA).
- `Partner Accent`, if used, is the color of whoever the deck is being presented to or made for — useful for card accents, badges, and making a deck feel tailored.
- Background/Surface/Border tokens should stay stable across every deck you produce, so your decks build a recognizable visual identity over time. Everything else can flex per audience.

### Typography Table Format

```markdown
| Role | Font | Size | Weight | Color |
|---|---|---|---|---|
| Section Tag | [Font] | 10–12px | 700, ALL CAPS, wide letter-spacing | Accent color |
| Slide Headline | [Font] | 36–48px | 700 | Text-primary |
| Sub-headline | [Font] | 16–22px | 400 | Text-muted |
| Card Title | [Font] | 14–17px | 600 | Text-primary |
| Body Text | [Font] | 12–14px | 400 | Text-muted or dimmer variant |
| Spec Pill Label | [Font] | 10px | 600, ALL CAPS, wide spacing | On Surface-alt bg |
| Step Number | [Font] | 40–48px | 700–800 | Text-primary at low opacity (ghost) |
```

**Rule:** pick one typeface family for the whole deck (a display weight and a text weight is enough). Keep role-to-size-to-weight mappings fixed across all slides so the deck reads as one document, not a patchwork.

### Illustration / Imagery System

Write this sub-section covering whatever visual system the deck actually uses — line illustrations, photography, icon sets, screenshots, abstract shapes, or none at all. At minimum, define:

- **Core rules** — stroke weight / image treatment, fill vs. no-fill, angle/perspective convention, density limit per slide
- **Color use in imagery** — what each accent color does when it shows up inside an illustration or graphic (e.g. "signal color marks live data flow", "green marks a completed step")
- **Recurring components** — if the deck reuses certain visual objects (e.g. a product icon, a process arrow, a device mockup), define each one precisely once here so every slide draws it identically
- **Background treatment** — texture, gradient, or flat fill spec, including opacity if there's a grid or pattern
- **Weight/hierarchy** — how structural elements are visually distinguished from decorative or accent elements

If a deck uses no custom illustration system (e.g. photography-only or text-only slides), state that explicitly here instead of leaving the sub-section blank.

### Slide Layout Grid

```markdown
- Canvas: 16:9 — 1920 × 1080px (or your target size)
- Safe margin: [N]px all sides
- Bottom bar: [N]px — Surface background, Border top border
  - Left: [Deck/product wordmark] (small caps, muted)
  - Right: Slide number `01 / [TOTAL]`
- Section tag position: fixed top-left, consistent offset from top and left edges on every content slide
```

---

## Section 3 — Slides

Each slide is its own `##` section. Slides are numbered with zero-padded two-digit numbers.

### Slide Section Template

```markdown
## SLIDE [NN] — [SLIDE TITLE IN ALL CAPS]

**Layout:** [One-line description of the layout approach — grid, columns, full-bleed, etc.]

---

**TAG:** `[SECTION CATEGORY]`

**HEADLINE:** (color, size)
> "[Exact headline text in quotes]"

**SUB:** (color, size)
> "[Exact sub-headline text in quotes]"

---

**ILLUSTRATION / VISUAL ([position/size description]):**

[Detailed brief — what to show, where, at what weight, with which color accents. Written as a director giving instructions to a designer or illustrator. Be specific about every element.]

[Color-specific sub-sections if relevant:]
- Neutral/structural elements:
- [Signal color] elements:
- [Positive state color] elements:
- [Negative state color] elements:

---

**[LAYOUT ELEMENT — e.g. TWO COLUMNS / CARD GRID / STACKED CARDS]:**

[Content for each column/card/panel:]

**[Element Name or Number]:**
[Content — icon description, title, body, badge, verdict, etc.]

---

**BOTTOM NOTE / CALLOUT / STRIP:** ([style])
> "[Exact text]"

---
```

### Mandatory Slide Elements

Every slide must specify:
- `**Layout:**` — the top-level layout description
- `**TAG:**` — the section category pill, if the deck uses tags (skip only if the deck's design system doesn't include them)
- `**HEADLINE:**` — the exact copy, font size, weight
- At least one of: `**ILLUSTRATION / VISUAL:**` or a named content block (cards, columns, grid, etc.)
- `**BOTTOM BAR:**` if it has a special callout; otherwise write `**BOTTOM BAR:** Standard format.`

### Optional Slide Elements (include when relevant)
- `**SUB:**` — sub-headline below main headline
- `**BOTTOM NOTE:**` — muted footnote, centered
- `**BOTTOM CALLOUT:**` — bordered accent box with key statement
- `**BOTTOM STRIP:**` — full-width bar with spec pills or journey steps

### Illustration / Visual Brief Rules

Write visual briefs as **explicit, sequential instructions**, never as vague direction:
1. State the overall scene or composition in one sentence
2. List structural/neutral elements by name with precise instructions
3. List colored accent elements separately, by color token
4. State what is deliberately absent on this slide (e.g. "negative-state color: none on this slide")
5. End with a mood/intent line if the slide has a specific emotional tone to land

### Card / Panel Block Rules

When a slide has cards, panels, or tiles:
- State background, border, and accent-border spec for every card type
- List each card with: Icon description · Badge (if any) · Title · Body · Verdict/Footnote (if any)
- Cards representing a **positive/resolved** state get a distinct border + subtle fill in your positive-state color
- Cards representing a **failure/problem** state get no special border treatment beyond your negative-state color on the verdict text
- Cards representing an **active/CTA** state get an accent-colored left border

---

## Section 4 — Appendix

```markdown
## APPENDIX: PRODUCTION NOTES

### Production Approach
[Tool recommendations, consistency rules, color discipline rules, fill opacity rules, background treatment application]

---

### Slide Order Reference
| # | Slide Title | Visual | Dominant Accent Color |
|---|---|---|---|
[One row per slide]

---

### Animation Notes (if building in Keynote, PowerPoint, or similar)
[Transition type/duration, text animation, per-element animation rules for any recurring motion elements]

---

*[PROJECT] · [DECK TITLE] · [AUDIENCE] · [REF_CODE] · [confidentiality level, if any]*
```

---

## Theming Checklist

When starting a new deck (new audience, new client, or new product), run through this before writing:

- [ ] Decide whether this deck needs a Partner Accent color (i.e. is it being made *for* a specific client/audience whose brand should show up?) — if so, set it
- [ ] Set Section Tag color to the accent you want to lead with (your Brand Accent, or the Partner Accent if this is client-facing)
- [ ] Set all card left-border accents to the chosen accent color in slide briefs
- [ ] Set bottom callout borders and badge backgrounds to match
- [ ] Confirm your own Brand Accent still appears somewhere (logo, wordmark) regardless of what else is themed
- [ ] Set a `REF_CODE` if you're tracking multiple decks/versions
- [ ] Update the bottom bar wordmark with the correct product/deck name
- [ ] Update the final Appendix footer line with project, title, audience, ref code, and confidentiality level

---

## Common Mistakes to Avoid

- **No generic layouts** — every slide's `**Layout:**` line must be unique and specific to that slide
- **No vague visual briefs** — never write "add an illustration here." Specify every element, weight, and color
- **No mixed color semantics** — once a color means something (signal, positive, negative), it means that for the whole deck. Never swap meanings mid-deck.
- **No skipping the TAG** — if the design system uses section tags, every content slide needs one. Cover and closing slides are the usual exceptions.
- **No orphan `---` separators** — every `---` must separate a named block from the next named block
- **No floating copy** — every text element (headline, sub, body, note, callout) must have font size, weight, and color specified inline, not left implicit

---

## Quick Reference: Recurring Spec Patterns

| Element | Typical Spec |
|---|---|
| Card left-border accent | 2–3px, accent color |
| Bottom callout border | 1px, accent color |
| Status badge (positive) | Positive-color pill, high-contrast text |
| Status badge (problem/legacy) | Negative-color pill, high-contrast text |
| Status badge (transition/in-progress) | Signal-color pill, high-contrast text |
| Resolution panel | 1px positive-color border + low-opacity positive-color fill |
| Ghost step numbers | Text-primary at ~8% opacity, large size, heavy weight |
| Spec pills | Surface-alt bg, text-primary, small caps, subtle border |
| Confirmed annotation pills | Surface bg, 1px positive-color border |
| Section tag | Small, bold, ALL CAPS, wide letter-spacing, accent color |

---

## Getting Started

1. Copy this file's structure into a new `.md` file for your deck.
2. Fill in Section 1 (header) and Section 2 (design system) first — these are the contract every slide will follow.
3. Write slides one at a time using the Slide Section Template. Keep the copy and the visual brief together; don't write all the copy first and design later.
4. Finish with the Appendix — it's the handoff summary for whoever builds the actual slides.
5. Reuse your filled-in Section 2 as a starting template for your next deck so your visual identity stays consistent across projects.
