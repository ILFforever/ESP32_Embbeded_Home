# Arduino888 Frontend Redesign — "Glass"

Direction **D (Glass)** is approved. This file is the work breakdown. Tasks are
sized so one agent can take one task without colliding with another.

- **Mockups:** `mockups/glass/` — open `index.html` first
- **Both themes side by side:** `mockups/glass/dark.html`
- **Pin any page for review:** append `?theme=dark` or `?theme=light` to its URL
  (does not touch the reader's stored preference)
- **Design system:** `mockups/glass/glass.css` (single source of truth)
- **Shared behaviour:** `mockups/glass/glass.js`
- **Rejected directions** (for reference only): `mockups/redesign-directions.html`

---

## Ground rules

Read these before touching anything. Violations are the main way this redesign
goes wrong, and they're all things that already went wrong once during design.

### 1. The lens goes on the toolbar only
`glass.js` applies a real `feDisplacementMap` refraction filter to `.g-bar` and
nothing else. **Do not apply it to cards.** Measured, same machine, back to back,
scrolling a 12-pane dashboard:

| Config | mean frame | p95 | worst |
|---|---|---|---|
| Lens on all 12 panes | 14.1 ms | 38.2 ms | 42.7 ms |
| Lens on toolbar only | 6.1 ms | 6.4 ms | 7.1 ms |

Cards sit on wallpaper. There is no detail behind them to refract, so they pay
the full cost and show nothing. The toolbar is sticky, so real content moves
behind it — that is the only place refraction is visible.

**The toolbar floats and stays visible.** A pill inset 12px from the top,
detached from the page, never welded to it.

That leaves a gap above it and two open corners, which raw content will slide
through and make the bar look broken. The fix is the **scroll edge**
(`.g-page::before`), not docking the bar: a fixed strip across the top that
blurs and veils whatever passes under it, then fades to nothing, so content
dissolves *before* it reaches the pill.

Two things about it that will bite you if you move it:
- It is a pseudo-element of `.g-page`, not a child of `body`. `.g-page` creates
  a stacking context (`position: relative; z-index: 1`), and the bar's
  `z-index: 20` lives inside it. From the root context the scrim would paint
  over the entire page, bar included. It sits at `z-index: 15` — above content,
  below the bar.
- Its colour is `color-mix()` off `--ground`, so it follows the theme with no
  extra tokens. There is a `@supports` fallback to blur-only.

It costs about **2.3 ms** per scroll frame (6.1 → 8.4 ms mean). That is the
price of the floating treatment and it is within budget; see C3.

### 2. One backdrop-filter per element
The card rim (`.g-pane::after`) is painted gradients, not a second
`backdrop-filter`. Two filtered layers per pane doubled compositing cost for an
effect plain paint approximates.

### 3. Never animate the wallpaper
`.g-bg` is one static painted layer. It previously had six animated children
under `filter: blur(64px)`; because every pane's `backdrop-filter` samples that
layer, the re-blur cost was paid many times per frame. Leave it static.

### 4. Use the tokens
No new colours, radii, shadows, or font sizes. If something is genuinely missing,
add it to `glass.css` with a comment explaining why — do not inline it in a page.

### 5. Concentric radii
Inner radius = outer − padding. A 26px pane with 12px padding gets a 14px inner
tile. `--r-pane: 26px` / `--r-tile: 14px` already encode the common case.

### 6. Semantic colour is not decoration
`--accent` (dusty blue) is the only interface colour. `--ok` / `--warn` /
`--crit` mean exactly one thing each and never get used to add visual interest.

### 7. Both themes are real
Light and dark. Every theme-dependent value is a token, and components are
styled **through tokens only — never inside a media query**. There are four token
blocks in `glass.css` and they must stay in sync: `:root` (light),
`@media (prefers-color-scheme: dark)`, then `:root[data-theme="dark"]` and
`:root[data-theme="light"]` last so the in-page toggle beats the OS in *both*
directions.

Practical consequences:
- Chart and sparkline colours come from `currentColor` plus `.g-spark--warn` /
  `.g-chart--warn` modifiers. **Never hardcode a hex in SVG markup** — it will be
  wrong in one theme. SVG gradient stops accept `stop-color="currentColor"`.
- Ring colours go on a class (`.g-ring__fill.is-warn`), not a `stroke` attribute
  — `var()` in an SVG presentation attribute is not reliably supported.
- Dark is not an inversion. On a dark ground the shadow stack barely reads, so
  depth moves onto the edge light; the glass becomes a *tinted dark* veil rather
  than a white one, because a white veil over dark grey goes milky and hides the
  wallpaper.
- Every page needs the pre-paint snippet in `<head>` that reads the stored
  preference, or the wrong theme flashes for a frame.
- Semantic hues are relit for dark. `--ink-3` was measured at 3.30:1 on the dark
  pane (fails AA) and raised to 5.27:1. **If you add a text colour, measure it.**

### 8. No emoji, no gradient text, no glow
The old UI used all three. Icons are inline SVG (lucide paths are fine). Headings
are solid ink. Depth comes from the shadow stack, never from coloured glow.

### 9. Write copy from the user's side
"Nat came in the front door", not "FACE_DETECTION EVENT: recognized=true".
Buttons say what happens. Errors say how to fix it. No `alert()` — use the modal
pattern.

### 10. Navigation is the same on every top-level page
`Home · Plan · Access · Admin`, in that order, in the toolbar segmented control.
Doorbell and Hub are drill-downs reached from a device, so they use the
`.g-back` link instead — they are not in the nav. Do not mix in-page anchors (`#alerts`) with
page links in the same control; it looks like navigation and behaves like a
scroll.

### 11. Light source is fixed
Up and to the left, same for every pane on every page. Nothing tracks the
pointer. Cards do not lift, scale, or move on hover — only real controls respond,
and they respond on press.

---

## Phase A — Finish the mockups

Static HTML only. No React, no API. Depends on nothing; all four can run in
parallel.

### A1 · `admin.html` — Devices & admin
**Status:** ☑ built and reviewed · **Size:** M

Admin-only device management. Source of truth for content:
`src/components/dashboard/AdminManagementCard.tsx` (829 lines) and
`SystemStatusCard.tsx`.

Must include:
- Device table: id, name, type, online dot, battery ring, last seen, row actions.
  Use `.g-table` inside `.g-scroll`.
- Add-device flow (pairing mode) as a modal.
- Rename / remove device modals. Remove is destructive → `.g-btn--danger` +
  confirm copy naming the device.
- Per-device detail modal: `.g-info` definition grid (IP, RSSI, uptime, free
  heap, firmware).
- Empty state via `.g-empty` for "no devices enrolled yet".

**Done when:** renders with no horizontal page scroll at 1280 / 900 / 420 px, all
modals open and close by button + backdrop + Esc, no console errors.

### A2 · `access.html` — Doors & NFC cards
**Status:** ☑ built · **Size:** S

Source: `DoorCard.tsx`, `NfcManagementCard.tsx`.

Must include:
- Lock list with `.g-switch` per door, last-changed line, battery ring.
- NFC card table: holder, card id (mono), status chip (Active / Expired), last
  used, revoke action.
- "Add a card" modal — tap-to-enrol wait state.
- Revoke confirm modal naming the holder.

**Done when:** same criteria as A1.

### A3 · Dashboard expanded views
**Status:** ☑ built · **Size:** M

The current app opens 8 card types in a modal (`renderExpandedCard` in
`src/app/dashboard/page.tsx:208`). Add them to `dashboard.html` as
`.g-modal__card--wide` modals: system status, alerts, temperature, gas, doors,
admin, nfc, music.

Each gets a real chart or table, not a placeholder. Copy the chart markup from
the temperature modal in `hub.html` — grid hairlines, axis labels in
`--ink-3`, area fill gradient at .22–.30 opacity, emphasised endpoint dot.

**Done when:** all 8 open from their card, charts scale with the modal, no fixed
pixel widths.

### A3b · `plan.html` is built — extend it if you want upstairs
**Status:** ☑ built · **Size:** M

Spatial view: the house is the navigation, sensors are pinned where the
hardware physically is. Selecting a room updates the detail panel.

Two things to keep if you touch the drawing:
- Every decorative element (`.pl-wall`, `.pl-tag`, `.pl-pin`, …) sets
  `pointer-events: none`. They are painted *after* the room rects, so without
  it they sit on top and swallow the click — and they are siblings, so it never
  bubbles to the room.
- The outer wall is a single path with the doorways left as **real gaps**
  (`M22 22 H638 V418 H312 M252 418 …`). Do not draw a full rect and paint over
  it to fake an opening; the cover never matches and leaves a visible patch.
- Rooms are `role="button" tabindex="0"` with Enter/Space handling, and the
  focus ring is a separate `.pl-focus` rect because an SVG `<g>` cannot take an
  `outline`.

### A4 · Fill the two chart placeholders in `hub.html`
**Status:** ☑ built · **Size:** S

`#m-humidity` and `#m-air` currently show a `.g-empty` pointing here. Build them
from the `#m-temp` chart, plotting humidity (%) and PM2.5 (µg/m³).

---

## Phase B — Implement in React

**Phase A is complete and reviewed.** B1 is unblocked and can start now.

### B1 · Land the design system
**Status:** ☐ todo · **Size:** M · **Owner:** _unassigned_ · **Blocks: everything else in B**

- Replace `src/app/globals.css` (3,945 lines) with a port of `glass.css`.
- Delete the `data-theme="purple"` / `data-theme="green"` token blocks, the
  `body::before` animated radial background, and `@keyframes backgroundPulse`.
- Port `glass.js` to a `useGlassLens()` hook or a `<GlassToolbar>` component.
  It must re-run on resize, on route change, **and on theme change** (the
  displacement map is generated against the current backdrop), and must skip
  elements with zero measured size.
- Theme: put the pre-paint snippet in the root layout's `<head>`. In Next.js App
  Router that means a `<script dangerouslySetInnerHTML>` in `app/layout.tsx`
  before children, so it runs before hydration.
- Remove the Google Fonts `@import` for Inter — the system stack in `--font` is
  deliberate and avoids a network dependency.

**Done when:** every existing page still renders (broken styling is expected at
this point), and no `--primary` / `--bg-card` / `--shadow-glow` token remains.

### B2 · `LoginPage`
**Status:** ☐ todo · **Size:** S · Mockup: `login.html`
Keep the existing `useAuth().login(email, password)` wiring. The old purple/green
theme switcher is gone; the new toggle is light/dark only and lives in `.g-theme`.
On login (no toolbar) it floats top-right.

### B3 · `DashboardPage` shell
**Status:** ☐ todo · **Size:** M · Mockup: `dashboard.html`
Toolbar + large title + attention card + stat strip + bento grid. **Delete the
sidebar** (`src/app/dashboard/page.tsx:262-334`) — navigation moves into the
toolbar segmented control. Also delete the per-card `.card-eye-icon` buttons;
the whole card opens its modal.

### B4 · Dashboard card components
**Status:** ☐ todo · **Size:** L · **Parallelisable — one agent per card**
Convert each to the Glass components. Compact and expanded variants both.

| Component | File | Size |
|---|---|---|
| ☐ Climate | `TemperatureCard.tsx` | S |
| ☐ Air quality | `GasReadingsCard.tsx` | S |
| ☐ Recent activity | `AlertsCard.tsx` | M |
| ☐ Doors | `DoorCard.tsx` + `DoorsWindowsCard.tsx` | S |
| ☐ Broadcast | `MusicBroadcastCard.tsx` | S |
| ☐ Devices | `SystemStatusCard.tsx` | M |
| ☐ Admin | `AdminManagementCard.tsx` | L |
| ☐ NFC | `NfcManagementCard.tsx` | M |

Rules for all eight: replace Recharts default styling with the tokens (Recharts
stays, only the props change); replace every `alert()` with the modal pattern;
replace emoji with inline SVG.

### B5 · `DoorbellPage`
**Status:** ☐ todo · **Size:** L · Mockup: `doorbell.html`
The current file is 3,010 lines with six modals and the PCM audio pipeline.
**Do not touch the audio or stream logic** — it works. This is a presentation
change only: swap the markup and styles, keep every handler.

### B6 · `HubPage`
**Status:** ☐ todo · **Size:** M · Mockup: `hub.html`
Three sensor cards each opening a 24h history modal, mic toggle, amplifier
controls, hub info grid, activity list.

---

## Phase C — Cleanup

### C1 · Delete dead CSS
**Status:** ☐ todo · **Size:** S
After B1–B6, sweep `globals.css` for unused selectors (`.sidebar-*`,
`.theme-toggle`, `.modal-overlay`, `.card-eye-icon`, `.dashboard-grid` areas).

### C2 · Accessibility pass
**Status:** ☐ todo · **Size:** M
Every control keyboard-reachable with a visible focus ring; modals trap focus and
restore it on close; `aria-pressed` on toggles; charts have `role="img"` and a
sentence-long `aria-label` stating the actual range. Minimum 24px hit targets —
the slider needed a 24px-tall element around its 5px visible track.

**Contrast must be measured in both themes, not eyeballed.** Composite the
translucent pane over the ground before computing the ratio, or the number is
meaningless. Text under 18pt needs 4.5:1.

### C3 · Performance check
**Status:** ☐ todo · **Size:** S
Re-run the frame-time measurement on the real app. Budget: **p95 under 16.7 ms**
while scrolling the dashboard. If it misses, the first thing to check is whether
a `backdrop-filter` leaked onto cards.

Reference numbers from the mockups (headless Chrome, GPU rasterisation, 1400x820):

| Config | mean | p95 |
|---|---|---|
| Lens on 12 panes, animated wallpaper | 14.1 ms | 38.2 ms |
| Lens on toolbar only, static wallpaper | 6.1 ms | 6.4 ms |
| …plus the scroll edge (current) | 8.4 ms | 8.5 ms |

There are exactly **two** always-on `backdrop-filter` layers by design: the
toolbar and the scroll edge. A third is a regression.

---

## How to verify your work

There is a headless Chrome harness pattern used throughout the design phase.
Install `puppeteer-core` (not `puppeteer` — use the system Chrome, no download)
in a scratch directory, then for each page assert:

```js
// after page.goto(...) and ~900ms settle
const info = await page.evaluate(() => ({
  lens: document.querySelector('.g-bar')?.style.backdropFilter.includes('url'),
  xOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
}));
// also collect page.on('pageerror') and page.on('requestfailed')
```

Expected: `lens: true` on every page with a toolbar, `xOverflow: false` at 1280 /
900 / 420 px, zero page errors, zero failed requests.

Run every check **twice**, once per theme, via
`page.emulateMediaFeatures([{name:'prefers-color-scheme', value:'dark'}])`. Also
assert the toggle path: click `.g-theme`, confirm `data-theme` is stamped,
`localStorage` persists, and after a reload the stored value beats the OS
preference.

Screenshot and **look at it**. Four real bugs during design were invisible in the
source and obvious in a render:
- `preserveAspectRatio="none"` stretched sparkline endpoint dots into ellipses
- a masked rim read as a hard inset picture frame, not a lens
- SVG door-swing arcs drew outside the walls (settled by measuring `getBBox()`,
  not by reasoning about sweep flags)
- CSS existed for six wallpaper blobs when the markup only ever had four

Also note: elements inside a `display: none` container measure **zero**. Activate
the tab or scroll into view before measuring or hovering, or your test silently
passes against nothing.

---

## Status summary

| Phase | Tasks | Done |
|---|---|---|
| Foundation | glass.css (light + dark), glass.js, index.html | 3 / 3 ✅ |
| A — Mockups | login, dashboard, plan, doorbell, hub, dark, admin, access, A3, A4 | 10 / 10 ✅ |
| B — React | B1–B6 (B4 is 8 sub-tasks) | 0 / 13 |
| C — Cleanup | C1–C3 | 0 / 3 |
