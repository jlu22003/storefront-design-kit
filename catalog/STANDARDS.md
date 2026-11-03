<!-- Generated from catalog/standards.json by scripts/catalog-docs.mjs. Do not edit by hand: change the JSON and run `npm run catalog:docs`. -->

# Standards catalog

187 standards in 17 families for responsive storefront layouts.
Each rule is a web adaptation written in our own words and informed by Apple's Human Interface Guidelines (HIG); no HIG text is copied.
Departures from the HIG are listed in [LIBERTIES.md](LIBERTIES.md) (30 liberties).

## Legend

- **Enforcement**: *automated* means a test or lint can fail the build; *visual* means a screenshot-regression diff flags it for review; *principle* means a design-review checklist item. A standard can carry more than one label.
- *automated (warn)* reports a warning but does not fail the build. *automated (partial)* means automation covers only part of the rule; review covers the rest.
- **HIG** links point to pages under https://developer.apple.com/design/human-interface-guidelines/.
- **WCAG** lists WCAG 2.2 success criteria (https://www.w3.org/TR/WCAG22/) with their conformance level.
- **Units**: 1 HIG pt = 1 CSS px, written in rem at a 16 px root unless the rule says px. The CSS pt unit is banned (LIB-01).
- References such as "§3.1" point to sections of the research report the catalog was built from.

## Summary

| Family | Standards | Automated | Visual | Principle |
|---|---|---|---|---|
| [Layout and adaptivity (LAY)](#layout-and-adaptivity-lay) | 14 | 9 | 6 | 5 |
| [Typography (TYP)](#typography-typ) | 13 | 10 | 3 | 1 |
| [Color (COL)](#color-col) | 12 | 7 | 2 | 5 |
| [Dark mode (DRK)](#dark-mode-drk) | 6 | 5 | 3 | 0 |
| [Accessibility (ACC)](#accessibility-acc) | 19 | 16 | 1 | 4 |
| [Motion (MOT)](#motion-mot) | 7 | 3 | 0 | 4 |
| [Materials and depth (MAT)](#materials-and-depth-mat) | 8 | 2 | 4 | 3 |
| [Icons (ICN)](#icons-icn) | 8 | 4 | 2 | 4 |
| [Imagery (IMG)](#imagery-img) | 6 | 4 | 1 | 2 |
| [Buttons and actions (BTN)](#buttons-and-actions-btn) | 9 | 7 | 3 | 1 |
| [Forms and inputs (FRM)](#forms-and-inputs-frm) | 17 | 12 | 1 | 6 |
| [Navigation and search (NAV)](#navigation-and-search-nav) | 13 | 8 | 2 | 4 |
| [Modals, sheets, popovers, alerts (MOD)](#modals-sheets-popovers-alerts-mod) | 14 | 11 | 0 | 5 |
| [Lists, collections, grids (LST)](#lists-collections-grids-lst) | 10 | 6 | 3 | 2 |
| [Feedback, loading, progress (FBK)](#feedback-loading-progress-fbk) | 11 | 5 | 1 | 8 |
| [Writing (WRT)](#writing-wrt) | 10 | 5 | 0 | 6 |
| [Commerce patterns (COM)](#commerce-patterns-com) | 10 | 4 | 0 | 7 |
| **Total** | **187** | **118** | **32** | **67** |

## Layout and adaptivity (LAY)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **LAY-01** | Put the most important content first in reading order (top, then the inline-start side). DOM order matches visual order. | No `tabindex>0`. No CSS `order` or `*-reverse` on interactive siblings. | [layout](https://developer.apple.com/design/human-interface-guidelines/layout) | 1.3.2 (A), 2.4.3 (A) | automated | — |
| **LAY-02** | Align items to a shared grid. Indentation shows subordination. Group related items with spacing, containers, or separators. | Spacing comes from tokens only | [layout](https://developer.apple.com/design/human-interface-guidelines/layout) | 1.3.1 (A) | visual, principle | — |
| **LAY-03** | Use progressive disclosure for secondary detail (accordion, menu, "more" page) rather than showing everything. | — | [layout](https://developer.apple.com/design/human-interface-guidelines/layout) | — | principle | — |
| **LAY-04** | Adapt to available space (container or viewport width), never to user-agent or device type. | No UA sniffing in JS | [layout](https://developer.apple.com/design/human-interface-guidelines/layout) | 1.3.4 (AA) | principle, visual | — |
| **LAY-05** | Functionality is identical at every width. Only how much is visible, and how it is arranged, changes (e.g., nav links ↔ drawer, sidebar filters ↔ filter sheet). | Key flows pass at 320 px and 1280 px | [layout](https://developer.apple.com/design/human-interface-guidelines/layout) | 1.4.10 (AA) | automated | — |
| **LAY-06** | Reflow: vertical content never needs two-dimensional scrolling at 320 CSS px width. | `scrollWidth ≤ innerWidth` at 320 px | [layout](https://developer.apple.com/design/human-interface-guidelines/layout) | 1.4.10 (AA) | automated | — |
| **LAY-07** | Layout survives large text: adjacent items stack, containers grow, nothing clips or overlaps. | 200% root font-size: no clipped text, no horizontal scroll | [layout](https://developer.apple.com/design/human-interface-guidelines/layout), [typography](https://developer.apple.com/design/human-interface-guidelines/typography) | 1.4.4 (AA), 1.4.12 (AA) | automated, visual | — |
| **LAY-08** | Respect safe areas. With `viewport-fit=cover`, backgrounds bleed edge to edge while controls sit inside `env(safe-area-inset-*)`. | Fixed and sticky bars pad by `env()` | [layout](https://developer.apple.com/design/human-interface-guidelines/layout) | — | automated, visual | — |
| **LAY-09** | Constrain prose to a readable measure. | ≤ 75ch max, 66ch target (ours) | [layout](https://developer.apple.com/design/human-interface-guidelines/layout) | — | automated | — |
| **LAY-10** | Full-bleed media fills its frame without distortion: scale or crop (`object-fit: cover`), never stretch. | No `object-fit: fill` on media with mismatched ratio | [layout](https://developer.apple.com/design/human-interface-guidelines/layout) | — | automated, visual | — |
| **LAY-11** | Fixed or sticky chrome (header, bottom cart bar) never fully hides the focused element or critical controls. | Focused element at least partly visible; `scroll-padding` set | [layout](https://developer.apple.com/design/human-interface-guidelines/layout) (macOS), [scroll-views](https://developer.apple.com/design/human-interface-guidelines/scroll-views) | 2.4.11 (AA) | automated | — |
| **LAY-12** | Use size classes: compact / regular / wide breakpoints at page level, container queries inside components. | Breakpoints from tokens only | [layout](https://developer.apple.com/design/human-interface-guidelines/layout) | — | principle | — |
| **LAY-13** | RTL-ready: logical properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`), so `dir="rtl"` mirrors the layout. | Stylelint bans physical left/right properties | [right-to-left](https://developer.apple.com/design/human-interface-guidelines/right-to-left) | 1.3.2 (A) | automated | — |
| **LAY-14** | RTL exceptions: don't mirror numerals, logos, photos, media controls that point to real directions, or real-world objects. Do mirror back/forward chevrons, progress, and text-direction icons. | `dir=rtl` screenshot set | [right-to-left](https://developer.apple.com/design/human-interface-guidelines/right-to-left) | — | visual, principle | — |

## Typography (TYP)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **TYP-01** | Default reading text is the Body style. No rendered text is smaller than the minimum. | Body 17 px (1.0625rem); min 11 px anywhere; storefront legal or meta text ≥ 12 px (ours) | [typography](https://developer.apple.com/design/human-interface-guidelines/typography), [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | — | automated | — |
| **TYP-02** | Font sizes use `rem`/`em` so browser text-size settings scale them (the Dynamic Type analogue). Never set the root font-size in px. | Stylelint: `font-size` units ∈ {rem, em, %}; `html` font-size not px | [typography](https://developer.apple.com/design/human-interface-guidelines/typography) | 1.4.4 (AA) | automated | — |
| **TYP-03** | Text enlarges to at least 200% with no loss of content or function. | 200% text-only and 200% page zoom | [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | 1.4.4 (AA) | automated | — |
| **TYP-04** | No light weights for UI text. Use regular, semibold, or bold only. A thin display face needs larger sizes. | Computed `font-weight ≥ 400`; token weights {400, 600, 700} | [typography](https://developer.apple.com/design/human-interface-guidelines/typography) | — | automated | — |
| **TYP-05** | Hierarchy comes from a fixed set of text styles (Large Title … Caption 2, plus 2 display sizes). No ad-hoc sizes. | Stylelint: `font-size` must be a `var(--sdk-font-size-*)` | [typography](https://developer.apple.com/design/human-interface-guidelines/typography) | 1.3.1 (A) | automated | — |
| **TYP-06** | Minimise typefaces. | ≤ 2 families per page (sans + optional serif/display); mono only in code, SKUs, and numbers | [typography](https://developer.apple.com/design/human-interface-guidelines/typography), [branding](https://developer.apple.com/design/human-interface-guidelines/branding) | — | automated | — |
| **TYP-07** | Leading suits the use: tight for single-line UI, loose for long passages. Never tight leading on 3+ lines. | UI ≥ 1.25; `.prose` ≥ 1.45 | [typography](https://developer.apple.com/design/human-interface-guidelines/typography) | 1.4.12 (AA) | automated | — |
| **TYP-08** | User text-spacing overrides cause no clipping or overlap. | Inject line-height 1.5, paragraph spacing 2em, letter-spacing 0.12em, word-spacing 0.16em; no overflow clip | [typography](https://developer.apple.com/design/human-interface-guidelines/typography) | 1.4.12 (AA) | automated | — |
| **TYP-09** | Minimise truncation as text grows. Important text (product titles, prices, errors) wraps. Any truncated text is available in full on the same or the next view. | Clamp ≤ 3 lines on cards; full text on PDP | [typography](https://developer.apple.com/design/human-interface-guidelines/typography) | 1.4.4 (AA) | visual, principle | — |
| **TYP-10** | At large text sizes, drop columns and stack secondary items (badges, prices, timestamps) under the text. | 200% matrix screenshots | [typography](https://developer.apple.com/design/human-interface-guidelines/typography) | 1.4.10 (AA) | visual | — |
| **TYP-11** | Keep hierarchy order stable as text grows (primary items stay first and on top). | 200% matrix screenshots | [typography](https://developer.apple.com/design/human-interface-guidelines/typography) | 1.3.2 (A) | visual | — |
| **TYP-12** | Font delivery: open (OFL-1.1) fonts only. Inter for UI and body text, Source Serif 4 for optional editorial headings, IBM Plex Mono for code and numbers. No SF Pro, not even through system-font keywords; never ship Apple font files (§3.1). | Asset scan rejects `SF-*`, `SFNS*`, `SFPro*`, `NewYork*`; `@font-face` must not name SF; font stacks do not name `-apple-system`, `BlinkMacSystemFont`, or SF fonts | [typography](https://developer.apple.com/design/human-interface-guidelines/typography) | — | automated | [LIB-12](LIBERTIES.md) |
| **TYP-13** | Custom (web) fonts still honour user text size; use `font-display: swap` and metric-matched fallbacks to avoid layout shift. | CLS ≤ 0.1 (Lighthouse) | [typography](https://developer.apple.com/design/human-interface-guidelines/typography) | — | automated | — |

Notes:

- **TYP-06**: Revised from the research report for the owner decision of 2026-11-03: open fonts only (Inter, Source Serif 4, IBM Plex Mono; all OFL-1.1), no SF Pro.
- **TYP-12**: Revised from the research report for the owner decision of 2026-11-03: open fonts only (Inter, Source Serif 4, IBM Plex Mono; all OFL-1.1), no SF Pro.

## Color (COL)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **COL-01** | Text contrast meets the minimum against its actual background, in every appearance mode. | 4.5:1; 3:1 for large text (≥ 24 px, or ≥ 18.66 px bold) (LIB-04) | [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [color](https://developer.apple.com/design/human-interface-guidelines/color) | 1.4.3 (AA) | automated | [LIB-04](LIBERTIES.md) |
| **COL-02** | Primary and secondary text roles aim higher, as HIG dark-mode guidance asks for custom colors. | ≥ 7:1 for `label`/`label-secondary` on base surfaces | [dark-mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) | 1.4.6 (AAA) | automated | — |
| **COL-03** | Component boundaries, focus indicators, and meaningful icons contrast with adjacent colors. | ≥ 3:1 | [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | 1.4.11 (AA) | automated | — |
| **COL-04** | Never use color alone for meaning (sale price, error, stock state, selected swatch, link in text). Add text, an icon, a shape, or an underline. | — | [color](https://developer.apple.com/design/human-interface-guidelines/color), [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | 1.4.1 (A) | automated (partial), principle | — |
| **COL-05** | One meaning per color. Accent means interactive / primary action, so non-interactive text never uses the accent or link color. | — | [color](https://developer.apple.com/design/human-interface-guidelines/color) | — | principle, visual | — |
| **COL-06** | Components use semantic role tokens only (`bg`, `label`, `separator`, `link`, `accent`, `status-*`) and never repurpose a role (e.g., separator as text). | Stylelint: no hex/rgb/hsl/named colors outside the tokens build | [color](https://developer.apple.com/design/human-interface-guidelines/color) | — | automated | — |
| **COL-07** | Every color role defines four values: light, dark, increased-contrast light, increased-contrast dark. | Token schema test | [color](https://developer.apple.com/design/human-interface-guidelines/color) | — | automated | — |
| **COL-08** | Use accent sparingly: at most 1–2 filled-accent (prominent) buttons per view. | ≤ 2 visible `.sdk-button--prominent` per viewport | [buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [branding](https://developer.apple.com/design/human-interface-guidelines/branding) | — | automated | — |
| **COL-09** | Over colourful content (hero images, colored sections), controls go monochrome rather than adding accent-coloured labels. | — | [color](https://developer.apple.com/design/human-interface-guidelines/color), [buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | — | visual | — |
| **COL-10** | Images use or embed sRGB. P3 is optional, gated by `@media (color-gamut: p3)` with an sRGB fallback. | — | [color](https://developer.apple.com/design/human-interface-guidelines/color), [images](https://developer.apple.com/design/human-interface-guidelines/images) | — | principle | — |
| **COL-11** | Don't hard-code Apple system color values. They are reference only; tokens are our own. | — | [color](https://developer.apple.com/design/human-interface-guidelines/color) | — | principle | — |
| **COL-12** | Status colors are consistent site-wide, and their cultural meaning is reviewed (red is not universally "danger"). | — | [color](https://developer.apple.com/design/human-interface-guidelines/color) | — | principle | — |

## Dark mode (DRK)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **DRK-01** | Follow the OS appearance (`prefers-color-scheme`) and declare `color-scheme: light dark`. Any site toggle defaults to "System" (LIB-15). | Dark tokens render under `emulateMedia({colorScheme:'dark'})` | [dark-mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) | — | automated | [LIB-15](LIBERTIES.md) |
| **DRK-02** | A dark palette is designed, not inverted: dimmer backgrounds, brighter foregrounds, base vs elevated surfaces. Sheets, popovers, and dialogs use elevated. | Token test: luminance of elevated > base in dark | [dark-mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) | — | automated, visual | — |
| **DRK-03** | Check contrast in light, dark, and both increased-contrast modes. | axe run in every color project | [dark-mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) | 1.4.3 (AA), 1.4.11 (AA) | automated | — |
| **DRK-04** | Soften white-background product images in dark mode so they don't glow. | `--sdk-media-dim-dark: 0.92` brightness (ours) | [dark-mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) | — | visual | — |
| **DRK-05** | Icons work in both appearances. SVG icons use `currentColor`; raster logos get dark variants. | Lint: SVG icons have no hard-coded fill | [dark-mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) | 1.4.11 (AA) | automated, visual | — |
| **DRK-06** | Native form controls follow the scheme through `color-scheme`; custom fields use role tokens. | — | [dark-mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) | — | automated | — |

## Accessibility (ACC)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **ACC-01** | Touch and click targets meet the default control size. The WCAG minimum is an absolute floor for dense inline cases. | Default ≥ 44×44 px; floor 24×24 px with spacing exception | [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | 2.5.8 (AA), 2.5.5 (AAA) | automated | — |
| **ACC-02** | Space between targets matters as much as size. | ~12 px around bezeled controls, ~24 px around borderless ones | [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | 2.5.8 (AA) | automated (warn) | — |
| **ACC-03** | Every control has an accessible name; icon-only buttons have labels; the visible label is part of the name. | axe `button-name`, `link-name`, `label`, `label-content-name-mismatch` | [voiceover](https://developer.apple.com/design/human-interface-guidelines/voiceover) | 4.1.2 (A), 2.5.3 (A) | automated | — |
| **ACC-04** | Meaningful images get alt text; decorative images get `alt=""` or `aria-hidden`. | axe `image-alt`, `svg-img-alt`, `role-img-alt` | [voiceover](https://developer.apple.com/design/human-interface-guidelines/voiceover) | 1.1.1 (A) | automated | — |
| **ACC-05** | Headings and landmarks give structure: one `h1`, no skipped levels, header/nav/main/footer. | axe `page-has-heading-one`, `heading-order`, `landmark-one-main`, `region` | [voiceover](https://developer.apple.com/design/human-interface-guidelines/voiceover) | 1.3.1 (A), 2.4.6 (AA) | automated | — |
| **ACC-06** | Announce dynamic changes (cart count, add-to-cart result, filter result counts) through a live region. | `role="status"` updated after the action | [voiceover](https://developer.apple.com/design/human-interface-guidelines/voiceover), [feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) | 4.1.3 (AA) | automated | — |
| **ACC-07** | Everything works by keyboard alone, including dropdown/mega navigation. No keyboard traps. | Playwright Tab walk reaches every interactive element; Esc closes overlays | [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards) | 2.1.1 (A), 2.1.2 (A) | automated | — |
| **ACC-08** | Don't override browser or OS shortcuts. Custom shortcuts only for frequent commands, never single-character without a modifier. | — | [keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards) | 2.1.4 (A) | principle | — |
| **ACC-09** | Every focusable element shows a visible focus indicator. | `:focus-visible` outline ≥ 2 px, ≥ 3:1 vs unfocused state and adjacent color | [focus-and-selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection) | 2.4.7 (AA), 2.4.13 (AAA) | automated | — |
| **ACC-10** | Focus never moves without user action. Focus order follows DOM order. Only a dedicated search page may autofocus its field. | No `autofocus` outside allowlist; no `tabindex>0` | [focus-and-selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection), [search-fields](https://developer.apple.com/design/human-interface-guidelines/search-fields) | 2.4.3 (A), 3.2.1 (A) | automated | — |
| **ACC-11** | Sticky headers and bars never fully obscure focus. | `scroll-padding-block-start` ≥ sticky header height | [scroll-views](https://developer.apple.com/design/human-interface-guidelines/scroll-views) | 2.4.11 (AA) | automated | — |
| **ACC-12** | Every gesture (swipe carousel, drag slider, swipe-to-dismiss sheet) has a single-pointer, button-based alternative. | Prev/next buttons; Close button | [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [gestures](https://developer.apple.com/design/human-interface-guidelines/gestures) | 2.5.1 (A), 2.5.7 (AA) | automated | — |
| **ACC-13** | No time-boxed UI for essential information. Toasts carrying errors or actions persist until dismissed. | No auto-dismiss on `role=alert` or toasts with actions | [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | 2.2.1 (A), 2.2.2 (A) | automated | — |
| **ACC-14** | Media is under the user's control: no autoplay with sound; autoplaying motion has a pause control; captions on spoken video. | `video[autoplay]` must be `muted` with a pause control; `<track kind=captions>` on spoken video | [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [playing-video](https://developer.apple.com/design/human-interface-guidelines/playing-video) | 1.2.2 (A), 1.4.2 (A), 2.2.2 (A) | automated (partial), principle | — |
| **ACC-15** | No flashing content. | ≤ 3 flashes per second | [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | 2.3.1 (A) | principle | — |
| **ACC-16** | Declare the page language and the language of foreign-language passages. | axe `html-has-lang`, `valid-lang` | [inclusion](https://developer.apple.com/design/human-interface-guidelines/inclusion) | 3.1.1 (A), 3.1.2 (AA) | automated | — |
| **ACC-17** | Forced colors (Windows contrast themes): no information lost, focus still visible. | `forcedColors:'active'` project + axe + screenshot | [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) (Increase Contrast analogue) | 1.4.11 (AA) | automated, visual | — |
| **ACC-18** | Respect `prefers-contrast: more` by switching to the increased-contrast token set. | `contrast:'more'` project | [color](https://developer.apple.com/design/human-interface-guidelines/color), [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | 1.4.3 (AA) | automated | — |
| **ACC-19** | Charts, size guides, and infographics also expose their data as text or a table. | — | [charting-data](https://developer.apple.com/design/human-interface-guidelines/charting-data), [voiceover](https://developer.apple.com/design/human-interface-guidelines/voiceover) | 1.1.1 (A), 1.3.1 (A) | principle | — |

## Motion (MOT)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **MOT-01** | Motion is purposeful and brief. Durations and easings come from tokens. | UI transitions ≤ 400 ms (ours) | [motion](https://developer.apple.com/design/human-interface-guidelines/motion) | — | automated | — |
| **MOT-02** | Under `prefers-reduced-motion: reduce`, replace translate/scale/zoom/parallax with fades or nothing. No depth or blur animation. Carousels don't auto-advance. | `document.getAnimations()` has no transform keyframes under reduce | [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [motion](https://developer.apple.com/design/human-interface-guidelines/motion) | 2.3.3 (AAA), 2.2.2 (A) | automated | — |
| **MOT-03** | Motion never carries information alone; pair it with a text or state change. | — | [motion](https://developer.apple.com/design/human-interface-guidelines/motion) | 1.3.3 (A) | principle | — |
| **MOT-04** | Motion is interruptible; nothing blocks input while it plays. | No `pointer-events:none` overlays during transitions | [motion](https://developer.apple.com/design/human-interface-guidelines/motion) | — | principle | — |
| **MOT-05** | No decorative motion on high-frequency interactions (e.g., scaling every product card on hover). | — | [motion](https://developer.apple.com/design/human-interface-guidelines/motion) | — | principle | — |
| **MOT-06** | Feedback motion follows the spatial model: a sheet that rises from the bottom dismisses downward; a side drawer exits to its side. | — | [motion](https://developer.apple.com/design/human-interface-guidelines/motion) | — | principle | — |
| **MOT-07** | Auto-advancing content (carousels, tickers) is off by default; when on, it has pause/stop. | Applies if it runs > 5 s; `marquee` and `blink` banned (axe) | [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | 2.2.2 (A) | automated | — |

## Materials and depth (MAT)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **MAT-01** | Translucent "glass" material only for the functional layer floating above content (sticky header, bottom bar, sheet chrome), never for content cards. | — | [materials](https://developer.apple.com/design/human-interface-guidelines/materials) | — | principle, visual | — |
| **MAT-02** | Use material sparingly, on the most important functional surfaces only. | ≤ 2 material surfaces per viewport (ours) | [materials](https://developer.apple.com/design/human-interface-guidelines/materials) | — | principle | — |
| **MAT-03** | Text on material stays legible against the worst-case backdrop. | Token test: label and secondary label ≥ 4.5:1 with the material composited over pure black and pure white (§4.3) | [materials](https://developer.apple.com/design/human-interface-guidelines/materials) | 1.4.3 (AA) | automated | — |
| **MAT-04** | Fallbacks: no `backdrop-filter` → opaque; `prefers-reduced-transparency: reduce` → opaque; `prefers-contrast: more` → opaque + border; `forced-colors` → `Canvas`. | CSS presence lint + Chromium emulation | [materials](https://developer.apple.com/design/human-interface-guidelines/materials) | 1.4.3 (AA), 1.4.11 (AA) | automated | — |
| **MAT-05** | "Clear" (very transparent) material only over media, with a dark scrim when the media is bright. | Scrim 35% (HIG figure) | [materials](https://developer.apple.com/design/human-interface-guidelines/materials) | 1.4.3 (AA) | visual | — |
| **MAT-06** | Elevation: light mode uses a shadow scale; dark mode uses lighter elevated surfaces plus a hairline border instead of shadows. | — | [dark-mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) | — | visual | — |
| **MAT-07** | Pick a material by role (thin/regular/thick), not by look. Thicker material for dense text. | Thin: primary label only | [materials](https://developer.apple.com/design/human-interface-guidelines/materials) | — | principle | — |
| **MAT-08** | One scroll-edge treatment (fade or blur) per view where content scrolls under floating chrome. | — | [scroll-views](https://developer.apple.com/design/human-interface-guidelines/scroll-views) | — | visual | — |

## Icons (ICN)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **ICN-01** | Interface icons are simple and consistent (grid, stroke, corner style), with stroke weight matched to adjacent text. | One icon set per site; stroke token | [icons](https://developer.apple.com/design/human-interface-guidelines/icons) | — | visual, principle | — |
| **ICN-02** | Icons are SVG, use `currentColor`, and are sized in `em`/tokens so they scale with text. | No raster icons in `assets/icons` | [icons](https://developer.apple.com/design/human-interface-guidelines/icons), [typography](https://developer.apple.com/design/human-interface-guidelines/typography) | 1.4.4 (AA) | automated | — |
| **ICN-03** | Icon-only controls carry a text alternative; decorative icons are `aria-hidden="true"`. | axe + custom: an `svg` in a nameless button fails | [icons](https://developer.apple.com/design/human-interface-guidelines/icons) | 1.1.1 (A), 4.1.2 (A) | automated | — |
| **ICN-04** | Familiar actions get familiar icons (search, cart, account, close, share, wishlist). Use a text label when it reads clearer. | — | [icons](https://developer.apple.com/design/human-interface-guidelines/icons), [buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | — | principle | — |
| **ICN-05** | Provide a selected-state icon variant only when needed (filled heart), and expose state via `aria-pressed`. | Toggle buttons have `aria-pressed` | [icons](https://developer.apple.com/design/human-interface-guidelines/icons) | 4.1.2 (A) | automated | — |
| **ICN-06** | No SF Symbols or confusingly similar glyphs; no renderings of Apple hardware (§3.1). | Asset scan + review | [sf-symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols), [icons](https://developer.apple.com/design/human-interface-guidelines/icons) | — | automated, principle | — |
| **ICN-07** | Avoid text inside icons; localize any icon that must contain text. | — | [icons](https://developer.apple.com/design/human-interface-guidelines/icons) | 1.4.5 (AA) | principle | — |
| **ICN-08** | RTL mirroring per LAY-14. | — | [right-to-left](https://developer.apple.com/design/human-interface-guidelines/right-to-left) | — | visual | — |

## Imagery (IMG)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **IMG-01** | Serve resolution-appropriate images (1×–3× DPR) through `srcset`/`sizes` (Shopify `image_url` + `image_tag`). | Content `<img>` has `srcset` and `sizes`; Theme Check `ImgWidthAndHeight` | [images](https://developer.apple.com/design/human-interface-guidelines/images) | — | automated | — |
| **IMG-02** | Photos as JPEG/WebP/AVIF; flat art and icons as SVG; PNG only for raster art that needs transparency. | Asset lint | [images](https://developer.apple.com/design/human-interface-guidelines/images) | — | automated | — |
| **IMG-03** | Images are sRGB (or tagged); check them on real devices. | — | [images](https://developer.apple.com/design/human-interface-guidelines/images), [color](https://developer.apple.com/design/human-interface-guidelines/color) | — | principle | — |
| **IMG-04** | Text over images gets guaranteed contrast from a scrim/overlay token, never from the image itself. | Overlay token required on text-over-media components | [image-views](https://developer.apple.com/design/human-interface-guidelines/image-views) | 1.4.3 (AA) | automated, visual | — |
| **IMG-05** | Show media at its original aspect ratio and reserve its space. | `width`/`height` or `aspect-ratio`; CLS ≤ 0.1 | [playing-video](https://developer.apple.com/design/human-interface-guidelines/playing-video), [images](https://developer.apple.com/design/human-interface-guidelines/images) | — | automated | — |
| **IMG-06** | Imagery and copy are inclusive (people, settings, no stereotypes). | — | [inclusion](https://developer.apple.com/design/human-interface-guidelines/inclusion) | — | principle | — |

## Buttons and actions (BTN)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **BTN-01** | Same as ACC-01: the hit region meets the default size even when the visible shape is smaller. | ≥ 44×44 px hit region | [buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | 2.5.8 (AA) | automated | — |
| **BTN-02** | Custom buttons have distinct hover, pressed (`:active`), `:focus-visible`, and disabled states. | All 4 states declared; state screenshots | [buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | 2.4.7 (AA) | automated, visual | — |
| **BTN-03** | At most one prominent (filled accent) button per section, and at most two per view. | See COL-08 | [buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | — | automated | — |
| **BTN-04** | Mark the preferred option by style (filled / tinted / plain), not by size. Buttons in a set share a size. | — | [buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | — | visual | — |
| **BTN-05** | Labels are verbs ("Add to cart", "Check out"). No "click here". Sentence-style capitalisation, no trailing punctuation. | Locale lint | [writing](https://developer.apple.com/design/human-interface-guidelines/writing), [alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) | 2.4.4 (A), 2.4.6 (AA) | automated | — |
| **BTN-06** | Roles are primary, cancel, and destructive. A destructive action is never the primary/default (Enter) button; it is styled as destructive. | Dialog API rejects destructive + default | [buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) | — | automated | — |
| **BTN-07** | Slow actions show progress inside the button, with an updated label ("Adding…") and `aria-busy`. The button keeps its size, and the result is announced. | Add-to-cart test | [buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | 4.1.3 (AA) | automated | — |
| **BTN-08** | An action that needs more input before it completes ends its label with "…" ("Choose options…"). | — | [menus](https://developer.apple.com/design/human-interface-guidelines/menus), [buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | — | principle | — |
| **BTN-09** | Apple Pay / express checkout: never build or imitate Apple Pay buttons; use Shopify's dynamic checkout rendering. Platform buttons are never smaller or harder to reach than other payment buttons. Side by side, Apple Pay sits after "Add to cart", with a matching corner radius. | No "Apple Pay" strings or logos in theme assets | [apple-pay](https://developer.apple.com/design/human-interface-guidelines/apple-pay) | — | automated, visual | — |

## Forms and inputs (FRM)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **FRM-01** | Every field has a persistent visible label. Placeholder text is only a hint or example. | axe `label`; custom: a placeholder is never the only label | [text-fields](https://developer.apple.com/design/human-interface-guidelines/text-fields) | 1.3.1 (A), 3.3.2 (A) | automated | — |
| **FRM-02** | Use the right `type`/`inputmode`/`autocomplete` (email, tel, postal-code, `cc-*`) so the correct keyboard and autofill appear. Get data from the system (autofill) rather than retyping. | Known-purpose fields carry an `autocomplete` token; axe `autocomplete-valid` | [text-fields](https://developer.apple.com/design/human-interface-guidelines/text-fields), [entering-data](https://developer.apple.com/design/human-interface-guidelines/entering-data), [virtual-keyboards](https://developer.apple.com/design/human-interface-guidelines/virtual-keyboards) | 1.3.5 (AA) | automated | — |
| **FRM-03** | Field width hints at the expected length. | — | [text-fields](https://developer.apple.com/design/human-interface-guidelines/text-fields) | — | visual | — |
| **FRM-04** | Validate at the right time: format on blur, password rules before leaving the field. Errors sit next to the field, are linked by `aria-describedby`, and set `aria-invalid`. | Form tests | [text-fields](https://developer.apple.com/design/human-interface-guidelines/text-fields), [entering-data](https://developer.apple.com/design/human-interface-guidelines/entering-data) | 3.3.1 (A), 3.3.3 (AA) | automated | — |
| **FRM-05** | Error copy says how to fix the problem; no blame, no "Oops", no bare "Invalid X". | Locale lint | [writing](https://developer.apple.com/design/human-interface-guidelines/writing) | 3.3.3 (AA) | automated, principle | — |
| **FRM-06** | Never prefill passwords. Use secure fields with show/hide, and support password managers and passkeys. | `autocomplete` ∈ {`current-password`, `new-password`, `webauthn`} | [entering-data](https://developer.apple.com/design/human-interface-guidelines/entering-data), [managing-accounts](https://developer.apple.com/design/human-interface-guidelines/managing-accounts) | 3.3.8 (AA) | automated | — |
| **FRM-07** | Offer choices instead of typing where possible (select, radios, segmented, stepper). | — | [entering-data](https://developer.apple.com/design/human-interface-guidelines/entering-data) | — | principle | — |
| **FRM-08** | Mark required data clearly. Keep submit enabled; validate on submit and focus the first error (LIB-16). | `required`/`aria-required` present | [entering-data](https://developer.apple.com/design/human-interface-guidelines/entering-data) | 3.3.2 (A) | automated | [LIB-16](LIBERTIES.md) |
| **FRM-09** | Don't ask for the same data twice in a flow (e.g., billing defaults to shipping). | — | [entering-data](https://developer.apple.com/design/human-interface-guidelines/entering-data) | 3.3.7 (A) | principle | — |
| **FRM-10** | Switches only in list/settings rows. Elsewhere use a toggle button (`aria-pressed`) or checkbox. State is never shown by color alone. | `role=switch` only inside the list-row component | [toggles](https://developer.apple.com/design/human-interface-guidelines/toggles) | 1.4.1 (A), 4.1.2 (A) | automated | — |
| **FRM-11** | Radios for mutually exclusive options beyond two; a checkbox for a single on/off; select/picker for medium-to-long lists in logical order. | — | [toggles](https://developer.apple.com/design/human-interface-guidelines/toggles), [pickers](https://developer.apple.com/design/human-interface-guidelines/pickers) | — | principle | — |
| **FRM-12** | Segmented controls (e.g., variant options): few segments of consistent width, either text or icons (not mixed), with noun labels. | ≤ 5 segments compact; ≤ 7 wide | [segmented-controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls) | — | automated | — |
| **FRM-13** | A quantity stepper shows the value it changes and pairs with an editable number field. Min/max are enforced and changes announced. | Quantity component test | [steppers](https://developer.apple.com/design/human-interface-guidelines/steppers) | 4.1.3 (AA) | automated | — |
| **FRM-14** | Range sliders (price filter) pair with number inputs and use the familiar direction (min at the start), mirrored in RTL. | Range filter has number inputs | [sliders](https://developer.apple.com/design/human-interface-guidelines/sliders) | 2.5.7 (AA) | automated | — |
| **FRM-15** | Search: placeholder says what is searched; results refine as the user types (debounced); suggestions; clear button; filters default broad. | Predictive-search test | [search-fields](https://developer.apple.com/design/human-interface-guidelines/search-fields), [searching](https://developer.apple.com/design/human-interface-guidelines/searching) | 3.3.2 (A) | automated, principle | — |
| **FRM-16** | Tabbing between fields follows the visual order. | See ACC-10 | [text-fields](https://developer.apple.com/design/human-interface-guidelines/text-fields) | 2.4.3 (A) | automated | — |
| **FRM-17** | Show search history only with privacy in mind (clearable, local). | — | [searching](https://developer.apple.com/design/human-interface-guidelines/searching) | — | principle | — |

## Navigation and search (NAV)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **NAV-01** | Primary navigation is for navigating, not for actions. It stays visible and consistent across sections. | — | [tab-bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | 3.2.3 (AA) | principle, visual | — |
| **NAV-02** | Keep top-level destinations few, with no overflow "More" bucket; single-word labels where possible. | Compact bottom bar ≤ 5 items (ours, LIB-20) | [tab-bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | — | automated | [LIB-20](LIBERTIES.md) |
| **NAV-03** | Never hide or disable a navigation item because its content is empty; show an empty state instead. | — | [tab-bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | 3.2.3 (AA) | principle | — |
| **NAV-04** | Nav items have text labels. The current location is marked. | `aria-current="page"` on the active link | [tab-bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | 1.3.1 (A), 2.4.8 (AAA) | automated | — |
| **NAV-05** | Badges only for actionable or critical info (cart count), with accessible text ("Cart, 3 items"). | Badge text in the accessible name | [tab-bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | 1.1.1 (A) | automated | — |
| **NAV-06** | Sidebars and menus show at most two hierarchy levels; deeper content gets its own page. | Menu depth ≤ 2 in sidebar/drawer | [sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) | — | automated | — |
| **NAV-07** | Sidebar (filters/collections) on wide layouts ↔ sheet/drawer on compact, with identical functionality. | See LAY-05 | [sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars), [layout](https://developer.apple.com/design/human-interface-guidelines/layout) | — | automated | — |
| **NAV-08** | Give search a prominent position when it matters (header at all widths, and a dedicated results page). | — | [searching](https://developer.apple.com/design/human-interface-guidelines/searching), [search-fields](https://developer.apple.com/design/human-interface-guidelines/search-fields) | — | principle | — |
| **NAV-09** | Standard back/close affordances. Breadcrumbs for deep catalogs (web extension). | — | [toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) | 2.4.8 (AAA) | principle | [LIB-25](LIBERTIES.md) |
| **NAV-10** | Header/toolbar is not overcrowded. Group by function: leading (logo, menu), center, trailing (search, account, cart). Trailing items stay visible at all widths. | — | [toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) | — | visual | — |
| **NAV-11** | Page titles are unique and concise, and don't lead with the store name. | `document.title` unique per template; pattern "Page – Store" | [toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) | 2.4.2 (A) | automated | — |
| **NAV-12** | Carousel page indicators only for short sets; longer sets use thumbnails or a grid. | ≤ 10 dots | [page-controls](https://developer.apple.com/design/human-interface-guidelines/page-controls) | — | automated | — |
| **NAV-13** | Skip link to main content (web extension). | axe `bypass`/`skip-link` | — | 2.4.1 (A) | automated | [LIB-25](LIBERTIES.md) |

## Modals, sheets, popovers, alerts (MOD)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **MOD-01** | Use modality only when it clearly helps. Keep modal tasks short, with no navigation stacks inside a modal. | — | [modality](https://developer.apple.com/design/human-interface-guidelines/modality) | — | principle | — |
| **MOD-02** | One modal at a time. Close the first before opening another, and never stack two alerts. | ≤ 1 open modal `dialog`, + ≤ 1 alert | [modality](https://developer.apple.com/design/human-interface-guidelines/modality), [sheets](https://developer.apple.com/design/human-interface-guidelines/sheets) | — | automated | — |
| **MOD-03** | Obvious dismissal: visible Close, Esc, backdrop/swipe for sheets. Focus returns to the element that opened the modal. | Dialog tests | [modality](https://developer.apple.com/design/human-interface-guidelines/modality) | 2.1.2 (A), 2.4.3 (A) | automated | — |
| **MOD-04** | Confirm before closing a modal that would discard user input. | Form-in-dialog test | [modality](https://developer.apple.com/design/human-interface-guidelines/modality) | 3.3.4 (AA) | automated | — |
| **MOD-05** | Each modal is titled with its task. | axe `aria-dialog-name` | [modality](https://developer.apple.com/design/human-interface-guidelines/modality) | 4.1.2 (A) | automated | — |
| **MOD-06** | Sheets (cart drawer, filters) pair Done/Apply with Cancel or Back. Resizable sheets show a grabber. Swipe-to-dismiss on touch, plus a button. | Sheet component test | [sheets](https://developer.apple.com/design/human-interface-guidelines/sheets) | 2.5.1 (A) | automated | — |
| **MOD-07** | Long or complex flows get a page, not a sheet. | — | [sheets](https://developer.apple.com/design/human-interface-guidelines/sheets) | — | principle | — |
| **MOD-08** | Popovers (menus, previews): small content, one at a time, anchored to their trigger, never for warnings. On compact widths they become sheets. | Popover → sheet below the compact breakpoint | [popovers](https://developer.apple.com/design/human-interface-guidelines/popovers) | 1.4.13 (AA) | automated, principle | — |
| **MOD-09** | Alerts are rare and actionable. No alert for undoable actions (remove from cart → undo toast). Nothing modal opens on page load (no entry newsletter pop-ups; legal age/consent gates excepted). | No dialog opens within 10 s of load without interaction | [alerts](https://developer.apple.com/design/human-interface-guidelines/alerts), [launching](https://developer.apple.com/design/human-interface-guidelines/launching), [onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) | 3.2.1 (A) | automated | [LIB-25](LIBERTIES.md) |
| **MOD-10** | Alert copy: concise title, message only if useful. Buttons are 1–2 word verbs; "Cancel" cancels; "OK" only for purely informational alerts; no Yes/No. | Locale lint | [alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) | 2.4.6 (AA) | automated, principle | — |
| **MOD-11** | Button order: the default action trails in a row (or tops a stack); Cancel leads (or sits at the bottom). Mirrored in RTL. | Dialog footer DOM-order test | [alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) | 1.3.2 (A) | automated | — |
| **MOD-12** | A destructive confirmation always offers Cancel. The destructive button looks destructive and is not the default. | Dialog API test | [alerts](https://developer.apple.com/design/human-interface-guidelines/alerts), [action-sheets](https://developer.apple.com/design/human-interface-guidelines/action-sheets) | — | automated | — |
| **MOD-13** | Use action sheets for choices tied to an intentional action. Neither alerts nor action sheets should scroll. | — | [action-sheets](https://developer.apple.com/design/human-interface-guidelines/action-sheets) | — | principle | — |
| **MOD-14** | Use native `<dialog>` (`showModal`) and the `popover` attribute; make the background inert. | `dialog` Baseline (Safari 15.4); `popover` Safari 17 / Chrome 114 / Firefox 125 (BCD) | [modality](https://developer.apple.com/design/human-interface-guidelines/modality) | 2.4.3 (A) | automated | — |

## Lists, collections, grids (LST)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **LST-01** | Text-heavy data (orders, specs) as lists or tables; visual items (products) as grids. | — | [lists-and-tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables), [collections](https://developer.apple.com/design/human-interface-guidelines/collections) | 1.3.1 (A) | principle | — |
| **LST-02** | Collections use the standard grid; cards in one grid share size and image ratio. | — | [collections](https://developer.apple.com/design/human-interface-guidelines/collections) | — | visual | — |
| **LST-03** | Items give press feedback. A product card has one primary link (single tab stop) with a visible focus ring. | Card tests | [collections](https://developer.apple.com/design/human-interface-guidelines/collections), [lists-and-tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables) | 2.4.7 (AA) | automated | — |
| **LST-04** | Row and card text is succinct; long titles wrap within a line cap, with the full text available. | See TYP-09 | [lists-and-tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables) | — | visual | — |
| **LST-05** | Tables have descriptive headers (`<th scope>`). | axe `th-has-data-cells`, `scope-attr-valid` | [lists-and-tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables) | 1.3.1 (A) | automated | — |
| **LST-06** | Insert/remove/reorder animation is subtle and respects reduced motion. | See MOT-02 | [collections](https://developer.apple.com/design/human-interface-guidelines/collections) | 2.3.3 (AAA) | automated | — |
| **LST-07** | Avoid layout jumps from dynamic content (infinite scroll, lazy cards); reserve space. | CLS ≤ 0.1 | [collections](https://developer.apple.com/design/human-interface-guidelines/collections) | — | automated | — |
| **LST-08** | No same-direction nested scroll containers (a horizontal rail inside the vertical page is fine). | No `overflow-y:auto` inside `overflow-y:auto` except dialogs | [scroll-views](https://developer.apple.com/design/human-interface-guidelines/scroll-views) | — | automated | — |
| **LST-09** | Show that more content exists: horizontal rails let the next item peek. | — | [scroll-views](https://developer.apple.com/design/human-interface-guidelines/scroll-views) | — | visual | — |
| **LST-10** | Disclosures (`details`/`summary`) have descriptive labels; at most one "show more" disclosure button per view. | `summary` has text | [disclosure-controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls) | 4.1.2 (A) | automated, principle | — |

## Feedback, loading, progress (FBK)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **FBK-01** | Show something immediately. Skeletons and placeholders reserve the layout. | CLS ≤ 0.1; Lighthouse perf ≥ 0.6 floor (§5) | [loading](https://developer.apple.com/design/human-interface-guidelines/loading) | — | automated, visual | — |
| **FBK-02** | People keep browsing while things load (async add-to-cart and filters). | — | [loading](https://developer.apple.com/design/human-interface-guidelines/loading) | — | principle | — |
| **FBK-03** | Determinate progress when the length is known, a spinner only otherwise. Keep it moving, in a consistent place. | `role=progressbar` with `aria-valuenow` when determinate | [progress-indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) | 4.1.2 (A) | automated, principle | — |
| **FBK-04** | Feedback is multimodal: text + icon + color, announced via a live region. | See ACC-06 | [feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) | 4.1.3 (AA), 1.4.1 (A) | automated | — |
| **FBK-05** | Status sits next to the thing it describes (inline stock, inline errors), not in a global alert. | — | [feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) | — | principle | — |
| **FBK-06** | Warn only for unexpected, irreversible loss. Expected removals get undo instead of a warning. | — | [feedback](https://developer.apple.com/design/human-interface-guidelines/feedback), [undo-and-redo](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo) | — | principle | — |
| **FBK-07** | Confirm significant completions (added to cart, order placed) without over-confirming. | — | [feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) | — | principle | — |
| **FBK-08** | When something can't be done (sold out, can't ship to region), explain why and offer a next step. | — | [feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) | 3.3.3 (AA) | principle | — |
| **FBK-09** | Empty states explain the situation and offer an action (empty cart → "Continue shopping"). | Empty-cart template renders a CTA | [writing](https://developer.apple.com/design/human-interface-guidelines/writing) | — | automated, principle | — |
| **FBK-10** | Let people cancel long operations where feasible. | — | [progress-indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) | — | principle | — |
| **FBK-11** | Load quickly; no splash/interstitial screens. | ⚠ Core Web Vitals "good" thresholds not verified this pass; Theme Store floor perf ≥ 60 (verified) | [launching](https://developer.apple.com/design/human-interface-guidelines/launching) | — | automated | — |

## Writing (WRT)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **WRT-01** | One defined voice; tone fits the context (errors are calm, marketing can be warmer). | — | [writing](https://developer.apple.com/design/human-interface-guidelines/writing) | — | principle | — |
| **WRT-02** | Action-oriented labels; descriptive link text (no bare "click here" or "read more"). | Locale lint | [writing](https://developer.apple.com/design/human-interface-guidelines/writing) | 2.4.4 (A) | automated | — |
| **WRT-03** | One capitalisation style per element type, applied everywhere. The kit uses sentence case (LIB-17). | Locale lint (heuristic) | [writing](https://developer.apple.com/design/human-interface-guidelines/writing), [alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) | — | automated (warn), principle | [LIB-17](LIBERTIES.md) |
| **WRT-04** | Multi-step flows use consistent step verbs (Continue/Next) and clear completion (Done). | — | [writing](https://developer.apple.com/design/human-interface-guidelines/writing) | 3.2.4 (AA) | principle | — |
| **WRT-05** | Use possessives sparingly; avoid "we" in errors ("Unable to load products"). | Locale lint for "We're…" or "Oops" in error strings | [writing](https://developer.apple.com/design/human-interface-guidelines/writing) | — | automated (warn) | — |
| **WRT-06** | Input-agnostic verbs ("select", "choose"), not "click" or "tap", in responsive UI (LIB-13). | Locale lint | [writing](https://developer.apple.com/design/human-interface-guidelines/writing) | — | automated (warn) | [LIB-13](LIBERTIES.md) |
| **WRT-07** | Error messages sit next to the problem and are actionable (see FRM-05). | — | [writing](https://developer.apple.com/design/human-interface-guidelines/writing) | 3.3.1 (A) | principle | — |
| **WRT-08** | Hints show format examples ("name@example.com"). | — | [writing](https://developer.apple.com/design/human-interface-guidelines/writing) | 3.3.2 (A) | principle | — |
| **WRT-09** | Plain, inclusive language: define jargon, use people-first disability language and gender-neutral copy. | — | [inclusion](https://developer.apple.com/design/human-interface-guidelines/inclusion) | 3.1.5 (AAA) | principle | — |
| **WRT-10** | All UI strings live in Shopify `locales/*.json`; no hard-coded copy in Liquid. | Theme Check `TranslationKeyExists`, `MatchingTranslations`, `ValidSchemaTranslations` | [writing](https://developer.apple.com/design/human-interface-guidelines/writing) | — | automated | — |

## Commerce patterns (COM)

| ID | Rule (web) | Threshold | HIG | WCAG 2.2 | Enforcement | Liberties |
|---|---|---|---|---|---|---|
| **COM-01** | Collect variant choices (size, color) before express-checkout buttons can act. | — | [apple-pay](https://developer.apple.com/design/human-interface-guidelines/apple-pay) | 3.3.2 (A) | principle | — |
| **COM-02** | Offer express checkout on product pages. Never hide or grey out platform payment buttons. Don't require account creation before purchase. | — | [apple-pay](https://developer.apple.com/design/human-interface-guidelines/apple-pay), [managing-accounts](https://developer.apple.com/design/human-interface-guidelines/managing-accounts) | — | principle | — |
| **COM-03** | Ratings show stars plus numeric text ("4.5 out of 5, 120 reviews"). Custom rating symbols must be clear. Never prompt for reviews mid-task or repeatedly. | Rating component accessible text | [rating-indicators](https://developer.apple.com/design/human-interface-guidelines/rating-indicators), [ratings-and-reviews](https://developer.apple.com/design/human-interface-guidelines/ratings-and-reviews) | 1.1.1 (A) | automated, principle | — |
| **COM-04** | Accounts: explain the benefit, delay sign-in, name the auth method, make account deletion discoverable (mostly Shopify-managed). | — | [managing-accounts](https://developer.apple.com/design/human-interface-guidelines/managing-accounts) | 3.3.8 (AA) | principle | — |
| **COM-05** | Ask for permissions (location for pickup, notifications) only when needed, in context, with clear copy, never on load, with no misleading pre-prompts. | No `geolocation`/`Notification.requestPermission` before a user gesture | [privacy](https://developer.apple.com/design/human-interface-guidelines/privacy) | 3.2.1 (A) | automated | — |
| **COM-06** | No launch splash or "advert" interstitials. | See MOD-09 | [launching](https://developer.apple.com/design/human-interface-guidelines/launching) | — | automated | — |
| **COM-07** | Teach in context. Postpone non-essential prompts (newsletter, tours). Legal consent banners excepted (LIB-25). | — | [onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) | — | principle | [LIB-25](LIBERTIES.md) |
| **COM-08** | Offer undo for reversible destructive actions (remove from cart). | — | [undo-and-redo](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo) | — | principle | — |
| **COM-09** | Share uses `navigator.share` where available, with a copy-link fallback. | — | [collaboration-and-sharing](https://developer.apple.com/design/human-interface-guidelines/collaboration-and-sharing) | — | principle | — |
| **COM-10** | Product video uses native controls at its original aspect ratio, with captions and no sound autoplay (ACC-14). | — | [playing-video](https://developer.apple.com/design/human-interface-guidelines/playing-video) | 1.2.2 (A) | automated | — |
