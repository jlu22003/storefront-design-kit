# storefront-design-kit

Responsive design system, layout primitives, and standards test suite for
Shopify themes and client sites.

A modular toolkit for prototyping responsive web layouts quickly. It targets
Shopify themes and client websites first, with a C toolkit built on
[Clay](https://github.com/nicbarker/clay) planned later. It pairs a design
system with a standards catalog and a test suite that checks layouts against it.

The standards are informed by Apple's Human Interface Guidelines. Each rule is
paraphrased and linked to its source; no HIG text or artwork is copied. This
project is independent and is not affiliated with or endorsed by Apple or
Shopify.

Typography uses open fonts only: Inter for UI and body text, Source Serif 4 for
optional editorial headings, and IBM Plex Mono for code and numbers.

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

`.shopifyignore` keeps repo-only folders (tokens, scripts, tests, catalog,
docs) out of `shopify theme push`.
