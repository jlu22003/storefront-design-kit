# Playground

A live prototyping page for the kit. No framework: plain HTML, the kit's CSS,
and a small Node server that uses only built-in modules.

## Run it

```sh
npm install   # once
npm run dev   # serves http://127.0.0.1:4400/playground/ and opens it
```

Options: `npm run dev -- --port 5000` picks a port, and `--no-open` skips
opening the browser. The server listens on 127.0.0.1 only and answers only to
localhost host names. It serves `theme/assets/`, `playground/`, `sketches/`,
and `lab/` (local copies of sites, below), and nothing else from the repo.

Saving an HTML or JS file reloads the page. Saving a CSS file swaps the
stylesheets in place, so the page keeps its scroll position and panel settings.

## Pages

- `index.html` links everything.
- `primitives.html` demonstrates each layout primitive and the text styles.
- `frames.html`, `variants.html`, and `bookmarklet.html` are the tools
  described below.
- `starters/landing.html`, `starters/product.html`, and
  `starters/collection.html` are full pages built only from the primitives and
  tokens. The `pg-` classes in `assets/sketch.css` are placeholder visuals
  that stand in for components until the kit ships them.

## Sketches (private)

```sh
npm run sketch -- my-idea                     # from the landing starter
npm run sketch -- pdp-test --from product     # or product, collection
```

This copies a starter to `sketches/<name>/index.html` and prints its URL.
Open `/sketches/` in the playground to see them all. Put extra CSS or images
beside the page in the same folder.

`sketches/` is gitignored. Nothing in it is committed or pushed, so it is the
place for half-finished ideas and client work. Back it up yourself if it
matters.

## Design panel

The **Design** button (bottom corner of every served page) opens a panel:

- **Appearance** (system, light, dark) preview. Color picks are kept per
  appearance: light picks apply in light, dark picks in dark.
- **Spacing**, **Type scale**, and **Corner radius** sliders scale every
  `--sdk-space-*`, `--sdk-font-size-*`, and `--sdk-radius-*` token.
- **Color pickers** for the main color roles, with live WCAG contrast ratios
  for text, links, accent, and control borders.
- **Copy CSS** copies only the tokens you changed: a `:root { … }` block, plus
  one block per appearance for the colors picked in it.
  **Reset** returns to the token values.

Changes are kept in this browser's localStorage, so they survive reloads.
To keep values, paste the copied CSS into a sketch stylesheet, or put the
numbers into `tokens/*.tokens.json` and run `npm run tokens`.

The panel is keyboard accessible: Tab to the button, and press Escape inside
the panel to close it and return focus to the button.

A page can turn the floating panel off with `<html data-sdk-panel="off">`.

## Format frames

`/playground/frames.html?src=/sketches/my-idea/` shows one page in seven
labeled frames side by side: phone (390 × 844), tablet (820 × 1180), desktop
(1440 × 900), square social post (1080 × 1080), story (1080 × 1920, 9:16),
email width (600 px), and a US Letter print page (816 × 1056). Each frame is
an iframe at the format's real size, scaled down to fit. **Fit** sizes the
frames so they all sit in one row; the **Frame height** slider makes them
bigger. Pick the page in the **Page** field: any page under `/playground/`,
`/sketches/`, or `/lab/` on the dev server (the list suggests the starters,
your sketches, and [local copies of sites](#local-copies-of-a-site)).

- The page's **Design** button restyles every frame at once: frames follow
  its saved settings.
- The print frame shows the page's print styles: its `print` media queries
  are switched on and `screen` ones off. Page breaks and `@page` margins are
  not shown.
- Saving CSS swaps it into every frame; saving anything else reloads the page.
- The social, story, and email frames show the page at that width. They are
  for brainstorming layouts, not for checking email-client support.

## Variant boards

`/playground/variants.html?src=/sketches/my-idea/&n=3` shows two to four
copies of a page side by side (**Variants**), at a phone, tablet, or desktop
width (**Width**). Each copy has its own design panel under it, with its own
saved settings (Variant A to D), so you can try different spacing, type,
corners, and colors on each. Mark one **Winner** and press **Copy winner's
CSS**, or use **Copy CSS** in any variant's panel. Settings and the winner
are kept in this browser's localStorage; each panel's **Reset** clears its
variant.

The board works on [local copies of sites](#local-copies-of-a-site) too:
`/playground/variants.html?src=/lab/copies/<name>/&n=3`, or pick a copy in the
**Page** field. A copy uses its own CSS rather than the kit's tokens, so each
variant gets the [live-site panel](#design-panel-for-any-site-bookmarklet)
instead: the copy's site variables, page overrides, contrast, and Copy CSS.
Its settings are saved per copy and per variant, and the copied CSS names the
site and the variant. Container spacing is measured in that variant's frame, at
the board's width.

## Local copies of a site

```sh
npm run lab:copy -- https://example.com/products/shirt
npm run lab:copy -- https://example.com/ --viewport phone   # copy at phone width
```

This makes a frozen copy of one page in `lab/copies/<host>-<date>-<time>/`
and prints its URL. With `npm run dev` running, open it at
`/lab/copies/<host>-<date>-<time>/`, or list every copy at `/lab/copies/`.
Copies show up in the **Page** field of the format frames and
[variant boards](#variant-boards) too. Press **Design** on a copy for the same panel the bookmarklet opens: its site
variables, page overrides, and Copy CSS. On a copy that panel can read every
stylesheet, since they are all served from this server.

`lab/` is gitignored. A copy holds another site's pages, images, and fonts, so
it never reaches this public repo. Copy only sites you own or have permission
to test.

The first time, install the browser it uses: `npx playwright install chromium`.

### What a copy keeps

Headless Chromium opens the page at desktop width (1280 px; `--viewport phone`
for a 412 px phone), waits for it to load, and scrolls through it so lazy
images load. Then it saves:

- **The page as its scripts left it**, so content rendered by JavaScript is
  kept. CSS-in-JS rules are written out as stylesheet text.
- **Every stylesheet, image, font, and video it loaded**, from any domain, in
  `assets/`. Files a stylesheet mentions but the page didn't load, such as another
  breakpoint's background image, are fetched too.
- **`manifest.json`**: the URL, time, viewport, size, and every file saved,
  failed (with the HTTP status), or skipped (with the reason).

It removes:

- scripts, `on…` event handler attributes, and `javascript:` links
- `<base>`, Content-Security-Policy and refresh `<meta>` tags, and preload and
  preconnect hints
- `integrity` (Subresource Integrity) attributes, since the saved stylesheets
  are rewritten to point at the copy

Iframes, `<object>`, and `<embed>` become a labelled box of the same size. Links
still point at the live site.

Options:

- `--max-mb 100` caps the saved files. Files past the cap are skipped and listed
  in the manifest.
- `--timeout 60` sets how many seconds the page may take to load.

### How a copy is served

Everything under `/lab/` is sent with a Content-Security-Policy: only this
server's own scripts run (the dev client), images, fonts, and styles load only
from this server, frames are off, and forms do not submit. So viewing a copy
never contacts the live site, even for a file the copy could not save. Copies
are not watched for live reload; they do not change once written.

### Limits

- **Frozen.** Menus, drawers, carousels, variant pickers, and the cart do not
  work, because the scripts are gone. The markup is what the scripts built at
  the copy's width; a site that builds different markup for phones needs a
  `--viewport phone` copy.
- **One page at a time.** There is no crawling, and pages behind a login, the
  cart, and checkout cannot be copied. Neither can password-protected
  storefronts, for now.
- **Bot protection** (challenge pages) can block the headless browser; the
  command reports the HTTP status and copies nothing.
- **Not kept:** embedded iframes, closed shadow roots, `<canvas>` drawings,
  URLs inside open shadow roots and inside SVG files, and CSS `image-set()`
  strings written without `url()`.

## Design panel for any site (bookmarklet)

`/playground/bookmarklet.html` explains how to install it: drag **SDK Design**
to the bookmarks bar, or press **Copy bookmarklet URL** and paste it as a
bookmark's URL. `npm run bookmarklet` writes the same URL to
`dist/bookmarklet.txt` (and readable code to `dist/bookmarklet.js`). Rebuild
it after changing the panel.

Click the bookmark on any site to open a design panel on that page; click it
again to hide or show the panel.

- **Site variables.** CSS custom properties on `:root` are sorted by name and
  value into spacing, type, and radius sliders and color pickers. Colors
  written as `18, 18, 18` (common in Shopify themes) are written back in the
  same form.
- **Page overrides** work on any site: body text size, line height, container
  spacing (padding and gaps of `main`, `section`, `header`, `footer`, `nav`,
  and container-like classes), corner radius of buttons, fields, images, and
  cards, and text, background, accent (buttons), and text-on-accent colors.
- **Contrast** shows WCAG ratios for text on background and text on accent.
- **Copy CSS** copies only what changed: a `:root` block for variables, then
  plain rules for the overrides and scaled containers.

It changes only the open tab. All changes live in one stylesheet it adds to
the page and a `data-sdk-live-box` attribute on each container it scales;
**Remove** takes both away, and so does reloading. It saves nothing (no
storage, no cookies) and sends nothing: the code and styles are inside the
bookmark, and it makes no network requests. The tests check the built
bookmarklet for network and storage APIs.

Limits: sites with a strict Content Security Policy may block bookmarklets.
Variables redefined on inner elements (per-section color schemes) keep their
own values; use the page overrides for those. Stylesheets from other domains
cannot be scanned, so only variables the browser lists in the computed style
are found there.

The source is `dev/live-panel.js`; `dev/bookmarklet.js` bundles it with
`dev/util.js`, `dev/panel.css`, and the token values the panel needs. Like
the kit's panel, it has two parts: `createLiveDesign()` holds the settings
(`{ scales, colors, overrides, factor }`) and applies them to one document,
and `mountLivePanel()` adds the UI, either the floating Design button or an
inline panel that styles another same-origin document (variant boards). Only
an inline panel saves its settings; the bookmarklet never does.
