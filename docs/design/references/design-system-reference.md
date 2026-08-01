# Combinado — Design System

> Extracted from the provided mobile login mockup. Measurements and colors are approximate because the source is a raster image.

## 1. Product expression

Combinado is a calm, private family-coordination product for two adults.

The interface should feel:

- warm rather than clinical;
- trustworthy rather than corporate;
- quiet and uncluttered;
- domestic, organized, and human;
- premium but approachable.

The visual language combines soft editorial interiors, natural materials, muted greens, warm neutrals, rounded geometry, and restrained typography.

---

## 2. Design principles

### Calm hierarchy

Every screen should have one clear primary action. Supporting information should be visually quieter and separated through spacing rather than heavy borders.

### Warm utility

Functional UI should remain practical, but use soft surfaces, natural colors, rounded corners, and gentle contrast.

### Privacy is visible

Security and privacy are part of the product value. Explain them in plain language through compact reassurance cards, not technical warnings.

### One-screen clarity

Avoid dense navigation, excessive cards, and competing calls to action. The user should understand the current state without exploring multiple layers.

### Domestic visual language

Use imagery and illustrations inspired by calm home interiors: pale wood, cream textiles, plants, sage green, muted terracotta, and soft daylight.

---

## 3. Color system

### Core palette

| Token | Approx. value | Usage |
|---|---:|---|
| `--color-olive-900` | `#3F4D2A` | Brand wordmark, headings, primary dark accents |
| `--color-olive-800` | `#4E5D32` | Primary button background |
| `--color-olive-700` | `#627044` | Secondary green accents |
| `--color-sage-500` | `#9AA078` | Illustration foliage, muted decorative elements |
| `--color-sage-300` | `#C3C8AE` | Soft fills and supportive backgrounds |
| `--color-terracotta-500` | `#D88B63` | Accent line, logo secondary color, warm highlights |
| `--color-terracotta-300` | `#E8B89D` | Soft decorative accent |
| `--color-cream-50` | `#FCFAF6` | Main page background |
| `--color-cream-100` | `#F7F2EA` | Cards and soft sections |
| `--color-cream-200` | `#EEE6DB` | Icon tile backgrounds and separators |
| `--color-sand-300` | `#D8C4AA` | Illustration furniture and neutral accents |
| `--color-text-primary` | `#1E1E1B` | Main body text |
| `--color-text-secondary` | `#6E6D68` | Supporting text and placeholders |
| `--color-border` | `#7A8359` | Input outlines and subtle emphasis |
| `--color-white` | `#FFFFFF` | Button text and light surfaces |

### Suggested semantic tokens

```css
:root {
  --background-app: #FCFAF6;
  --background-surface: #FFFFFF;
  --background-soft: #F7F2EA;
  --background-muted: #EEE6DB;

  --brand-primary: #4E5D32;
  --brand-primary-strong: #3F4D2A;
  --brand-secondary: #D88B63;

  --text-primary: #1E1E1B;
  --text-secondary: #6E6D68;
  --text-on-primary: #FFFFFF;

  --border-default: #D9D5CC;
  --border-emphasis: #7A8359;

  --icon-primary: #4E5D32;
  --icon-secondary: #6E6D68;
}
```

### Color usage rules

- Use olive green for primary actions, headings, logo elements, and key reassurance icons.
- Use terracotta sparingly as a warm accent.
- Use cream instead of pure white whenever a softer background is appropriate.
- Avoid saturated colors.
- Avoid high-contrast black unless needed for essential text.
- Decorative illustrations should remain lower-contrast than interactive UI.

---

## 4. Typography

The mockup uses a serif display face for the wordmark and a clean sans-serif for product UI.

### Recommended font pairing

- Display / logo: `Cormorant Garamond`, `Lora`, or a similar high-contrast editorial serif.
- UI / body: `Inter`, `SF Pro`, `Manrope`, or `DM Sans`.

### Type scale

| Token | Size | Weight | Line height | Usage |
|---|---:|---:|---:|---|
| `display-brand` | 52–58 px | 600 | 1.0 | “Combinado” wordmark |
| `eyebrow` | 12–14 px | 500 | 1.4 | Uppercase brand tagline |
| `title-lg` | 28–32 px | 600 | 1.15 | Screen titles |
| `title-md` | 22–24 px | 600 | 1.2 | Section headings |
| `title-sm` | 18–20 px | 600 | 1.3 | Card headings |
| `body-lg` | 18–20 px | 400 | 1.45 | Introductory copy |
| `body-md` | 16–17 px | 400 | 1.45 | Standard body |
| `body-sm` | 14–15 px | 400 | 1.45 | Supporting text |
| `button` | 18–20 px | 500 | 1.2 | Primary button labels |
| `caption` | 12–13 px | 500 | 1.4 | Small labels |

### Typography rules

- UI headings use olive green.
- Main body text uses near-black.
- Supporting copy uses muted gray.
- Keep line lengths short, especially on mobile.
- Use bold only for specific emphasis, not entire paragraphs.
- Letter spacing for the uppercase tagline should be approximately `0.22em`.

---

## 5. Spacing system

Use a 4 px base unit.

```text
4, 8, 12, 16, 20, 24, 32, 40, 48, 64
```

### Mobile layout spacing

- Horizontal page padding: `24 px`
- Compact card padding: `20–24 px`
- Section gap: `32–40 px`
- Major block gap: `48–64 px`
- Label-to-input gap: `12–16 px`
- Input-to-button gap: `20–24 px`

The screen should breathe. Prefer fewer elements with larger gaps over many compact elements.

---

## 6. Grid and layout

### Primary mobile frame

- Reference viewport: approximately `390 × 844 pt`
- Content width: full width minus `24 px` side padding
- Maximum content width on larger screens: `480 px`
- Main content alignment: centered
- Reading alignment: left for forms and cards; centered for brand and introductory content

### Vertical composition

1. Safe-area / status bar
2. Brand mark
3. Product name and tagline
4. Introductory promise
5. Privacy reassurance card
6. Email login section
7. Primary action
8. “Como funciona?” divider
9. Editorial illustration
10. Bottom reassurance card
11. Home indicator safe area

---

## 7. Shape language

### Border radii

| Token | Value | Usage |
|---|---:|---|
| `radius-sm` | `12 px` | Small icon containers |
| `radius-md` | `18 px` | Inputs and compact cards |
| `radius-lg` | `24 px` | Main cards and buttons |
| `radius-xl` | `32 px` | Bottom sheets or large feature cards |
| `radius-pill` | `999 px` | Pills and small badges |

### Visual rules

- Corners are consistently soft.
- Avoid sharp rectangular cards.
- Primary buttons should feel substantial and tactile.
- Use thin outlines rather than heavy shadows.
- Decorative image containers may blend directly into the page.

---

## 8. Elevation and shadows

The reference relies mostly on soft separation rather than visible elevation.

```css
--shadow-soft:
  0 8px 24px rgba(69, 58, 41, 0.06);

--shadow-card:
  0 4px 14px rgba(69, 58, 41, 0.05);

--shadow-button:
  0 8px 18px rgba(63, 77, 42, 0.12);
```

Use shadows sparingly. Cards may also use a subtle tinted background instead of elevation.

---

## 9. Iconography

### Style

- Rounded line icons
- Approximately `1.75–2 px` stroke
- Simple geometry
- No overly technical detail
- Olive green for reassurance and security icons
- Muted gray for form field icons

### Reference icons

- Lock: privacy card
- Envelope: email input
- Shield with check: security card
- Home / family: brand mark

Recommended icon libraries:

- Lucide
- Phosphor
- Heroicons Outline

Keep one icon family throughout the application.

---

## 10. Brand mark

The logo is formed by:

- two simplified adult figures;
- one sage/olive and one terracotta;
- their arms or roof shapes meet in the center;
- a small house body beneath;
- four small square windows.

The mark should remain geometric, friendly, and highly legible at small sizes.

### Wordmark

- Text: `Combinado`
- Editorial serif
- Olive green
- Large scale and tight line height

### Tagline

`ACORDOS QUE VIRAM ROTINA`

- Uppercase
- Sans-serif
- Wide tracking
- Muted dark gray
- Much smaller than the wordmark

---

## 11. Components

## 11.1 Primary button

```text
Height: 56–60 px
Width: 100%
Radius: 22–24 px
Background: olive green
Label: white
Font: 18–20 px, medium
```

States:

- Default: `#4E5D32`
- Pressed: `#3F4D2A`
- Disabled: sage-gray with reduced contrast
- Loading: spinner plus stable label width

Avoid gradients unless extremely subtle.

---

## 11.2 Text input

```text
Height: 56–60 px
Radius: 18–20 px
Border: 1–1.5 px olive-muted
Background: white or cream
Horizontal padding: 20 px
Icon gap: 14 px
```

States:

- Default: muted olive outline
- Focus: stronger olive outline plus a very soft focus ring
- Error: muted brick red; do not use bright red
- Disabled: cream fill and reduced opacity

The field label may live above the input rather than inside it.

---

## 11.3 Reassurance card

Used for privacy, security, or product promises.

Structure:

```text
[ icon tile ] [ heading
                supporting copy ]
```

Specifications:

- Background: warm cream
- Radius: `18–22 px`
- Padding: `18–22 px`
- Icon tile: `56–64 px`
- Icon tile background: slightly darker cream
- Heading: `16–18 px`, semibold
- Body: `15–16 px`, muted gray

These cards should not look clickable unless they are interactive.

---

## 11.4 Section heading

Example:

```text
Entrar com e-mail
Enviaremos um código de acesso.
```

- Heading in olive green
- Supporting line in muted gray
- Left aligned
- Tight internal gap, larger gap below

---

## 11.5 Divider label

Example: `Como funciona?`

Structure:

```text
────────  Como funciona?  ────────
```

- Thin warm-gray dividers
- Centered small label
- Large horizontal breathing room
- Not interactive unless explicitly styled as a link

---

## 11.6 Editorial illustration block

The visual is not a photo-realistic hero. It is a softly rendered interior illustration.

Characteristics:

- Warm cream wall
- Pale natural wood furniture
- Sage plants
- Sand-colored ceramics
- Soft terracotta detail
- Diffused daylight
- Very low contrast
- No people
- No readable text
- No hard outlines
- No glossy materials
- No strong shadows

Recommended aspect ratio for embedded mobile scenes: `16:9` or approximately `1.7:1`.

Illustrations may bleed to the screen edges but should not interfere with text or controls.

---

## 12. Login screen specification

### Header

- Centered logo mark near the top
- Wordmark directly beneath
- Tagline beneath wordmark
- Ample whitespace before the value proposition

### Value proposition

Suggested copy pattern:

```text
Coordenação da Casa para
dois Adultos. Um só Registro.
```

Use regular text with one concise bold phrase.

### Privacy card

```text
Privado e só nosso
Acesso por código enviado
para o seu e-mail.
```

### Form

```text
Entrar com e-mail
Enviaremos um código de acesso.

[ envelope icon ] seu@email.com

[ Enviar código ]
```

### Educational separator

```text
Como funciona?
```

### Lower visual section

Use a home interior illustration as an atmospheric bridge, followed by a security reassurance card.

### Security card

```text
Segurança e privacidade
Seus dados ficam apenas neste aparelho
e no backup da Casa.
```

Review this copy against the real architecture before shipping. Product claims must accurately reflect actual storage and backup behavior.

---

## 13. Motion

Motion should be subtle and reassuring.

### Recommended transitions

- Button press: `120–160 ms`
- Screen transition: `220–280 ms`
- Card appearance: fade plus `4–8 px` upward movement
- Input focus ring: `120 ms`
- Success feedback: small check animation, no confetti

Use standard easing:

```css
cubic-bezier(0.2, 0.8, 0.2, 1)
```

Avoid playful bounce or exaggerated movement.

---

## 14. Accessibility

- Maintain WCAG AA contrast for text and controls.
- Do not rely on color alone to indicate state.
- Minimum touch target: `44 × 44 px`.
- Body copy should not be smaller than `16 px` for primary reading content.
- Inputs require visible labels and clear error text.
- Illustration content must be decorative or have concise alt text.
- Support Dynamic Type / font scaling.
- Keep primary action reachable in one-handed use.
- Avoid placing essential content behind bottom safe areas.

---

## 15. Responsive behavior

### Mobile

- Single-column layout
- Full-width form controls
- Centered brand area
- Cards stack vertically

### Tablet / desktop PWA

- Constrain primary content to `480–560 px`
- Keep the warm full-page background
- Optionally use a two-column layout:
  - left: editorial illustration;
  - right: login or primary task.
- Preserve generous whitespace
- Do not stretch cards and forms across the entire viewport

---

## 16. CSS foundation

```css
:root {
  --font-display: "Cormorant Garamond", Georgia, serif;
  --font-ui: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

  --background-app: #FCFAF6;
  --background-surface: #FFFFFF;
  --background-soft: #F7F2EA;
  --background-muted: #EEE6DB;

  --brand-primary: #4E5D32;
  --brand-primary-strong: #3F4D2A;
  --brand-secondary: #D88B63;

  --text-primary: #1E1E1B;
  --text-secondary: #6E6D68;
  --text-on-primary: #FFFFFF;

  --border-default: #D9D5CC;
  --border-emphasis: #7A8359;

  --radius-sm: 12px;
  --radius-md: 18px;
  --radius-lg: 24px;
  --radius-xl: 32px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  --shadow-soft: 0 8px 24px rgba(69, 58, 41, 0.06);
}
```

---

## 17. Do and do not

### Do

- Use warm cream backgrounds.
- Keep primary actions olive green.
- Use natural, low-contrast illustrations.
- Separate sections through whitespace.
- Write concise, reassuring copy.
- Use rounded surfaces consistently.

### Do not

- Introduce bright blue, purple, or neon accents.
- Use dense dashboards or excessive card grids.
- Apply strong drop shadows.
- Add glossy gradients or glassmorphism.
- Mix multiple icon families.
- Place decorative imagery behind form text.
- Overuse terracotta.
- Make privacy claims that the implementation cannot support.

---

## 18. Design QA checklist

- Is there only one visually dominant action?
- Does the screen still feel calm at 200% text scaling?
- Are all touch targets at least 44 px?
- Are headings and labels consistently olive?
- Are supporting texts visibly quieter but still readable?
- Are illustration colors less prominent than interactive controls?
- Are radius, spacing, and icon styles consistent?
- Does every privacy statement match the real product architecture?
- Can the screen be understood without scrolling excessively?
- Does the product still feel warm without becoming decorative clutter?
