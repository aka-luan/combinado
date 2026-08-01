# Combinado — Design System

> Extracted from the mobile login mockup. Measurements and colors are approximate
> because the source is a raster image.
>
> **Pass 1 scope:** CSS tokens + branded login screen. Editorial raster assets are
> wired separately (see §11.6 placeholder in the login UI). Authenticated surfaces
> still use the pre-existing slate/`light-dark` styles until a later pass.

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

Security and privacy are part of the product value. Explain them in plain language through compact reassurance cards, not technical warnings. Claims must match the real architecture (Supabase Registro + device offline cache + encrypted ops backups).

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

### Semantic tokens

Defined in [`src/app/globals.css`](../src/app/globals.css) as `--background-app`, `--brand-primary`, etc.

### Color usage rules

- Use olive green for primary actions, headings, logo elements, and key reassurance icons.
- Use terracotta sparingly as a warm accent.
- Use cream instead of pure white whenever a softer background is appropriate.
- Avoid saturated colors.
- Avoid high-contrast black unless needed for essential text.
- Decorative illustrations should remain lower-contrast than interactive UI.

---

## 4. Typography

- Display / logo: `Cormorant Garamond` (via `next/font`)
- UI / body: `Inter` (via `next/font`)

| Token | Size | Weight | Usage |
|---|---:|---:|---|
| `display-brand` | 52–58 px | 600 | “Combinado” wordmark |
| `eyebrow` | 12–14 px | 500 | Uppercase brand tagline |
| `title-md` | 22–24 px | 600 | Section headings |
| `title-sm` | 18–20 px | 600 | Card headings |
| `body-md` | 16–17 px | 400 | Standard body |
| `body-sm` | 14–15 px | 400 | Supporting text |
| `button` | 18–20 px | 500 | Primary button labels |

Tagline letter-spacing: approximately `0.22em`.

---

## 5. Spacing and shape

4 px base unit: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.

Mobile: 24 px horizontal padding; content max-width 480 px on larger screens.

Radii: `12 / 18 / 24 / 32` px (`--radius-sm` … `--radius-xl`).

Shadows are soft and sparse (`--shadow-soft`, `--shadow-card`, `--shadow-button`).

---

## 6. Login screen composition

The full stack must fit a ~390×844 viewport without scrolling (PWA / mobile Safari).
Use the dense mobile scale in `globals.css` (tighter gaps, ~48 px controls, compact
cards, short illustration band) — not the generous desktop-mockup spacing from §5.

1. Brand mark + wordmark + tagline
2. Value proposition
3. Privacy reassurance card
4. Email OTP form (primary) + temporary-password secondary path
5. “Como funciona?” divider
6. Editorial illustration slot (raster wired later; height-capped, not full 16:9)
7. Security reassurance card

### Privacy copy (architecture-accurate)

- Privacy card: access by email code for authorized Adultos.
- Security card: Registro lives in the Casa cloud; this device holds an offline read cache only. Do **not** claim data stays “apenas neste aparelho.”

---

## 7. Motion

Subtle and reassuring: button press ~140 ms, card appearance fade + 4–8 px rise, easing `cubic-bezier(0.2, 0.8, 0.2, 1)`.

---

## 8. Do and do not

### Do

- Use warm cream backgrounds on branded surfaces.
- Keep primary actions olive green.
- Separate sections through whitespace.
- Write concise, reassuring copy that matches the architecture.

### Do not

- Introduce bright blue, purple, or neon accents.
- Apply strong drop shadows or glassmorphism.
- Make privacy claims the implementation cannot support.
- Stretch forms across the full desktop viewport.
