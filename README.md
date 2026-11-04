# storefront-design-kit

Responsive design system, layout primitives, and standards test suite for
Shopify themes and client sites.

A modular toolkit for prototyping responsive web layouts quickly. It targets
Shopify themes and client websites. It pairs a design system with a standards
catalog and a test suite that checks layouts against it.

The standards catalog is in [catalog/STANDARDS.md](catalog/STANDARDS.md).

The standards are informed by Apple's Human Interface Guidelines. Each rule is
paraphrased and linked to its source; no HIG text or artwork is copied. This
project is independent and is not affiliated with or endorsed by Apple or
Shopify.

Typography uses open fonts only: Inter for UI and body text, Source Serif 4 for
optional editorial headings, and IBM Plex Mono for code and numbers.

## Design tokens

Token sources live in `tokens/` as [DTCG](https://www.designtokens.org/)
JSON: `core.tokens.json` for spacing, type, radii, motion, sizes and the like,
and one `color.<mode>.tokens.json` per appearance (light, dark, and their
increased-contrast variants).

- `npm run tokens` builds `dist/sdk-tokens.css` (custom properties prefixed
  `--sdk-`), `dist/tokens.json`, and the committed copy the theme loads,
  `theme/assets/sdk-tokens.css`.
- `npm run tokens:check` fails when that committed copy is stale. CI runs it.
- `npm test` includes the token tests in `tests/tokens/`, named by catalog ID.
  They check WCAG contrast for every text role in every mode.

The CSS follows the OS appearance (`prefers-color-scheme`,
`prefers-contrast: more`, `prefers-reduced-motion`). Set
`data-theme="light"` or `data-theme="dark"` on `<html>` to override the
color scheme.

## Base CSS and layout primitives

Three stylesheets in `theme/assets/` make up the kit's CSS. Load them in this
order; the Shopify theme will load the same files:

```html
<link rel="stylesheet" href="sdk-tokens.css">     <!-- generated tokens -->
<link rel="stylesheet" href="sdk-base.css">       <!-- reset, text styles, focus, reduced motion -->
<link rel="stylesheet" href="sdk-primitives.css"> <!-- layout primitives -->
```

Layouts are built from ten primitives: `.sdk-box`, `.sdk-stack`, `.sdk-row`,
`.sdk-grid`, `.sdk-cluster`, `.sdk-switcher`, `.sdk-center`, `.sdk-float`,
`.sdk-clip`, and `.sdk-aspect`. Each container sets a direction, a gap, padding,
and alignment. Each child is sized as `grow`, `fit`, `fixed`, or `percent`.
Keywords are data attributes and amounts are custom properties:

```html
<div class="sdk-row" data-align-y="center" style="--child-gap: var(--sdk-space-12)">
  <img data-w="fixed" style="--w: 4rem" src="…" alt="…">
  <p data-w="grow">Grows into the space that is left.</p>
</div>
```

Start and end follow the reading direction, so `dir="rtl"` mirrors a layout.
The header comment in `sdk-primitives.css` documents every option, and the
playground has a live demo page.

`npm run lint:css` runs Stylelint. Its kit rules enforce catalog standards:
logical properties only (LAY-13), font sizes from text-style tokens in rem
(TYP-02, TYP-05), no `pt`, colors from role tokens only (COL-06), and
durations and easings from motion tokens (MOT-01). `catalog/lint-map.json`
maps each rule to its standard. CI runs the linter.

## Playground: prototype live

```sh
npm install
npm run dev
```

`npm run dev` starts a small local server (localhost only) and opens the
playground in your browser. It reloads the page every time you save a file.
Saved CSS is swapped in without a reload, so you keep your scroll position.

- **Starters.** The playground links a primitives demo and three starter pages,
  a landing page, a product page, and a collection grid, to copy from.
- **Sketches.** `npm run sketch -- my-idea` copies the landing starter to
  `sketches/my-idea/index.html`. Add `--from product` or
  `--from collection` to start from another one. `sketches/` is gitignored,
  so half-finished and client ideas never reach this public repo.
- **Design panel.** The **Design** button in the corner of every page opens
  sliders for spacing, type scale, and corner radius, plus color pickers for
  the main color roles. Changes show up on the page at once, and contrast
  ratios update as you go. **Copy CSS** copies only the values you changed,
  as a `:root { … }` block plus one block per appearance for picked colors.
  Paste it into a sketch stylesheet, or carry the numbers into
  `tokens/*.tokens.json` and run `npm run tokens`.

- **Format frames.** `/playground/frames.html` shows one page side by side
  as phone, tablet, desktop, square social post, 9:16 story, 600px email
  width, and a print page, each scaled to fit.
- **Variant boards.** `/playground/variants.html` shows two to four copies
  of a page, each with its own design panel. Mark a winner and copy its CSS.
- **Design panel for any site.** `npm run bookmarklet` builds a bookmarklet
  (or install it from `/playground/bookmarklet.html`) that opens a design
  panel on any live site. Drag spacing, type, corners, and colors, and copy
  out the values. It changes only the open tab, saves nothing, and sends
  nothing.
- **Local copies of a site.** `npm run lab:copy -- <url>` saves a frozen copy
  of one page (scripts removed, every stylesheet, image, and font kept) to the
  gitignored `lab/copies/`, and the playground serves it with the same design
  panel. Viewing a copy never contacts the live site. Copy only sites you own
  or have permission to test.

More detail is in [playground/README.md](playground/README.md).

## Standards tests

`npm test` runs the node unit tests: tokens, lint rules, the playground
server, and the tooling. The browser suite is Playwright with axe-core, run
against the playground pages in the PR-smoke projects: iPhone 17 Pro, iPad
Mini, and Desktop Chrome, each in light and dark, plus 200% text and reduced
motion on the iPhone.

```sh
npm run test:e2e:docker   # in the pinned Playwright image, like CI (needs Docker)
npm run test:e2e          # with local browsers; screenshot tests skip
```

Tests carry catalog IDs as tags (`@ACC-01`), and failures name the standard
with its HIG and WCAG links. They check reflow at 320px, 44px targets, focus
order and focus rings, text spacing, 200% text, dark mode, increased contrast,
reduced motion, and axe's WCAG 2.2 AA rules. Screenshot baselines of the
primitives demo and the starters are committed. They are rendered only in the
pinned Playwright image, so they match on every machine.

`npm run catalog:check` reports which standards have tests, from what the
test runners report rather than from test source. CI runs it with `--enforce`
after the Playwright run. It fails if a standard listed in
`catalog/enforced.json` loses its tests, or if a test names an unknown ID.
Details, including how to update baselines, are in
[tests/e2e/README.md](tests/e2e/README.md).

## License

MIT. See [LICENSE](LICENSE). Third-party material and its licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Files kept out of the repository

`.gitignore` keeps these out of the public repo:

- **Secrets and Shopify CLI state:** `.env` files, `shopify.theme.toml` (it can
  hold a Theme Access password), `.shopify/`, and keys. Copy
  `.env.example` and `shopify.theme.example.toml` to get started.
- **Client and merchant material:** `clients/`, `client-*` folders, theme
  `settings_data.json` files, and local copies of sites in `lab/`. Client work
  belongs in private repos; only the demo theme's sanitized settings are
  committed.
- **Restrictively licensed assets:** font files (except OFL fonts under
  `assets/fonts/ofl/`), installers, Apple design resources, SF Symbols
  exports, and Sketch files.
- **Dependencies and build output:** `node_modules/`, `dist/`, and `.zip`
  packages.
- **Test artifacts:** Playwright and Lighthouse reports, coverage, traces, and
  client-content screenshots.
- **OS, editor, and log files**, plus local agent settings
  (`.claude/settings.local.json`).

The demo Shopify theme lives in `theme/`; push it with
`shopify theme push --path theme`. Repo-only folders (tokens, scripts, tests,
catalog, docs) sit outside `theme/`, so they never reach Shopify.
`theme/.shopifyignore` keeps docs, tests, Markdown files, and npm manifests
placed inside the theme out of pushes and pulls.
