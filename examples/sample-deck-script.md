# ORBITAL: Series A Pitch Deck — PPT SCRIPT + DESIGN GUIDE v1
### Investors · Confidential · ORB_A01
### Design System: Near-black background · Flat line illustration · Confident, technical

---

### Philosophy
The deck reads as an engineering document, not a marketing brochure. Every slide is
dark, high-contrast, and grid-aligned — the visual language of a product built by
people who care about precision. Illustrations are flat, single-weight line art with
sparse color; nothing is decorative unless it also carries information.

---

### Color Palette

| Token | Hex | Use |
|---|---|---|
| Background | `#0B0B0E` | Slide base |
| Surface | `#151519` | Card backgrounds, inset panels |
| Surface-alt | `#1D1D22` | Alternate tiles, hover state |
| Border | `#26262C` | Subtle card borders |
| Text-primary | `#F5F5F7` | Headlines, all-caps labels |
| Text-muted | `#8A8A93` | Supporting text, footnotes |
| Signal (blue) | `#4C8DFF` | In-progress / technical elements |
| State: Positive | `#2ED573` | Confirmed states, resolved metrics |
| State: Negative | `#FF5C5C` | Problems, churn, failure modes |
| Brand Accent | `#F5C242` | CTA, section tags, wordmark |

---

### Typography

| Role | Font | Size | Weight | Color |
|---|---|---|---|---|
| Section Tag | Inter | 11px | 700, ALL CAPS, wide tracking | Brand Accent |
| Slide Headline | Inter | 42px | 700 | Text-primary |
| Sub-headline | Inter | 18px | 400 | Text-muted |
| Card Title | Inter | 15px | 600 | Text-primary |
| Body Text | Inter | 13px | 400 | Text-muted |
| Spec Pill Label | Inter | 10px | 600, ALL CAPS | On Surface-alt |
| Step Number | Inter | 44px | 800 | Text-primary at 8% opacity |

---

### Illustration / Imagery System

- **Core rules:** 1.5px single-weight line icons, no fill except semantic accents, isometric-free (flat front-on only), max 3 icons per slide.
- **Color use in imagery:** Signal blue marks live data flow / API calls. Positive green marks a resolved or completed step. Negative red marks churn or a failure point. Never reassign these mid-deck.
- **Recurring components:** a single "node" glyph (a circle with two ports) represents any service in the architecture; reused identically on every technical slide.
- **Background treatment:** flat `#0B0B0E`, no gradient, no grid texture.
- **Weight/hierarchy:** structural chrome (cards, dividers) uses Border color at 1px; decorative accents never exceed 2px.

### Slide Layout Grid

- Canvas: 16:9 — 1920 × 1080px
- Safe margin: 96px all sides
- Bottom bar: 48px — Surface background, Border top border
  - Left: "ORBITAL" wordmark, small caps, muted
  - Right: Slide number `01 / 03`
- Section tag position: fixed top-left, 96px from top, 96px from left, on every content slide

---

## SLIDE 01 — THE PROBLEM

**Layout:** Full-bleed headline over a single centered illustration, no cards.

---

**TAG:** `PROBLEM`

**HEADLINE:** (Text-primary, 42px, 700)
> "On-call engineers lose 6 hours a week to alerts that were never actionable."

**SUB:** (Text-muted, 18px)
> "Noise isn't a nuisance. It's the reason real incidents get missed."

---

**ILLUSTRATION / VISUAL (centered, 640px wide):**

A single "node" glyph at center, surrounded by six thin dotted lines radiating
outward to small ghost circles — representing a flood of low-signal alerts hitting
one engineer.

- Neutral/structural elements: the central node glyph, rendered in Text-primary at 1.5px stroke.
- Negative-state elements: three of the six radiating lines terminate in a small
  filled circle in Negative red — representing alerts that were false positives.
- Positive-state elements: none on this slide.

---

**BOTTOM NOTE:** (Text-muted, centered)
> "Source: internal survey of 40 SRE teams, 2026."

---

## SLIDE 02 — THE FIX

**Layout:** Two-column split — copy left, three-card vertical stack right.

---

**TAG:** `SOLUTION`

**HEADLINE:** (Text-primary, 42px, 700)
> "Orbital scores every alert before a human ever sees it."

**SUB:** (Text-muted, 18px)
> "Only the top 5% reach an on-call phone."

---

**STACKED CARDS (right column, 3 cards):**

Each card: Surface background, 1px Border, 2px left-border in Signal blue for the
active pipeline stage.

**Card 1 — Ingest:**
Icon: node glyph. Title: "Ingest". Body: "Every alert from every source lands in one pipeline." Badge: none.

**Card 2 — Score:**
Icon: node glyph with a small blue dot overlay. Title: "Score". Body: "A model trained on your team's own resolution history ranks urgency." Badge: `LIVE` pill in Signal blue.

**Card 3 — Route:**
Icon: node glyph with a green check overlay. Title: "Route". Body: "Only alerts above threshold page a human." Badge: `RESOLVED` pill in Positive green, subtle green fill behind the card.

---

**BOTTOM BAR:** Standard format.

---

## SLIDE 03 — THE ASK

**Layout:** Centered single-column, large numerals, CTA callout at bottom.

---

**TAG:** `THE ASK`

**HEADLINE:** (Text-primary, 42px, 700)
> "$4M to take Orbital from 12 design partners to category default."

**SUB:** (Text-muted, 18px)
> "18-month runway. Two hires: applied ML, enterprise sales."

---

**ILLUSTRATION / VISUAL (ghost step numbers, full width):**

Three large ghost numerals — "01", "02", "03" — in Text-primary at 8% opacity,
stacked left to right, each with a short caption beneath in Body Text style:
"Design partners → 50", "SOC2 Type II", "First enterprise logo".

- Neutral/structural elements: the three ghost numerals.
- Positive-state elements: a small green checkmark to the left of "SOC2 Type II" only, indicating it's already underway.
- Negative-state elements: none on this slide.

---

**BOTTOM CALLOUT:** (1px Brand Accent border, centered)
> "We've raised $0 in non-dilutive grants and are default-alive at current burn — this round buys speed, not survival."

---

*ORBITAL · Series A Pitch Deck · Investors · ORB_A01 · Confidential*
