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

## License

MIT. See [LICENSE](LICENSE). Third-party material and its licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Files kept out of the repository

`.gitignore` keeps these out of the public repo:

- **Secrets and Shopify CLI state:** `.env` files, `shopify.theme.toml` (it can
  hold a Theme Access password), `.shopify/`, and keys. Copy
  `.env.example` and `shopify.theme.example.toml` to get started.
- **Client and merchant material:** `clients/`, `client-*` folders, and theme
  `settings_data.json` files. Client work belongs in private repos; only the
  demo theme's sanitized settings are committed.
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
