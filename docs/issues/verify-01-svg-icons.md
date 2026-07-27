# verify-01 — Neutral SVG icons

**Type:** AFK · **Labels:** verification, needs-triage
**Parent:** [Build issues — next tiers](README.md) → Verification hardening

Fixes the `@n8n/scan-community-package` errors: `icon-not-svg` (×3 nodes),
`icon-prefer-themed-variants` (×3 warnings), `cred-class-field-icon-missing` /
`icon-validation` (webhook credential). **Do this first** — later verification
issues touch the same node/credential files.

## What to build

- Design a **neutral SVG icon** (⚠️ **not** Apple's logo — trademark; the current
  `*.png` is Apple's logo, which is both an SVG-format *and* a trademark problem).
  Something simple + evocative: a rounded app-tile / upward "release" arrow / "ASC"
  monogram. Keep it legible at 60×60.
- Provide **light and dark variants** and reference them via n8n's themed form:
  `icon: { light: 'file:appStore.svg', dark: 'file:appStore.dark.svg' }` (or a
  single SVG that reads on both themes if you prefer — but the linter warns unless
  themed variants are given).
- Wire into **all three nodes** (`AppStoreConnect`, `AppStoreConnectTrigger`,
  `VerifyWebhookSignature`) and **both credentials** (`AppStoreConnectApi`,
  `AppStoreConnectWebhook` — add an `icon` property). Remove the old PNG refs and
  the `// eslint-disable-next-line n8n-nodes-base/node-class-description-icon-not-svg`
  comments.
- Update `gulpfile.js` `build:icons` to copy `.svg` (and delete the `.png`s).

## Acceptance criteria

- [ ] Neutral SVG icon(s), light + dark, no Apple logo; all 3 nodes + 2 credentials reference them
- [ ] `npm run build` copies the SVGs into `dist/`; PNGs removed
- [ ] `npx @n8n/scan-community-package` no longer reports any icon errors/warnings
- [ ] Plus the shared [Definition of Done](README.md#definition-of-done--applies-to-every-issue) (lint/build/test/fallow, conformance green)

## Blocked by

None — foundational.
