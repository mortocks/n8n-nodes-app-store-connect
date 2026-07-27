# Contributing

Thanks for contributing to `n8n-nodes-apple-appstore` — n8n community
nodes for the Apple App Store Connect API.

## Prerequisites

- **Node.js ≥ 20.15** (see `engines`)
- **npm** (the repo is committed with `package-lock.json`)

## Setup

```bash
npm ci
npm run build      # tsc + gulp icon build → dist/
npm test           # jest
npm run lint       # eslint (eslint-plugin-n8n-nodes-base)
```

## Try it in a real n8n instance

A Dockerised n8n with this package preloaded lives in `docker/`:

```bash
npm run docker:refresh   # rebuild dist → repack .tgz → rebuild image → restart
```

Then open http://localhost:5678. The `n8n_data` volume persists your account and
credentials across refreshes. See `docker/README.md`.

## Architecture (where things go)

The action node is a single **declarative** node with Resource + Operation
dropdowns (idiomatic n8n — do not split into per-resource nodes). A resource is a
self-contained folder:

```
nodes/AppStoreConnect/
  resources/<domain>/<domain>.resource.ts   # operations + fields (routing)
  resources/<domain>/<domain>.body.ts        # JSON:API request-body builders / preSend
  resources/<domain>/<domain>.constants.ts   # resource type, enums
  resources/_shared/*                         # queryOptions, inputMode, listFilters, simplify, appLocator, params
  methods/<domain>.ts                         # listSearch / loadOptions pickers
  transport/*                                 # shared request + pagination + errors
```

Reuse the shared helpers rather than reinventing: the app picker (`searchApps`),
cursor pagination (`ascCursorPagination`), single/confirmation requests
(`ascSingleRequest` / `ascConfirmationRequest`), the error mapper, the Query
Options + Input Mode + Simplify + Sort field groups. Planned work is tracked in
[GitHub Issues](https://github.com/mortocks/n8n-nodes-app-store-connect/issues).

## Testing conventions

- **Deep modules** (crypto, pagination, event types, error mapper) have pure
  unit tests with fixed vectors.
- **ASC-facing wiring** (routing hooks, `listSearch` pickers, the trigger
  lifecycle) must have unit tests that **mock App Store Connect HTTP responses**
  — mock `this.makeRoutingRequest` (declarative hooks) or
  `this.helpers.httpRequestWithAuthentication` (pickers / trigger). Assert
  request shape, pagination, filtering, and that ASC `errors[]` map to
  `NodeApiError`.
- **Conformance** — `nodes/conformance.test.ts` checks every node/credential
  description against n8n UX conventions (Title Case, "Whether…" booleans,
  "e.g. " placeholders, masked secrets, well-formed operations/pickers). Keep it
  green.
- Doc-derived JSON:API type strings / filter keys are marked `⚠️` in code until
  confirmed against a live 2xx.

Before opening a PR: `npm run lint && npm run build && npm test`, and
`npx fallow dead-code` / `dupes` for code health (ignore the known n8n `dist/`
entry-point "unused files" false-positive).

## Pull requests

- Branch off `main`; open a PR against `main`. CI (lint + build + test on Node 20
  & 22) must pass. The PR template checklist is your guide.
- Keep commits focused; describe HITL (live-ASC) verification a reviewer/maintainer
  should do.

## Releasing (maintainers)

1. Bump `version` in `package.json`.
2. Commit and push to `main`.
3. Create a **GitHub Release** with tag `v<version>` (e.g. `v0.2.0`).
4. The `Release` workflow verifies the tag matches `package.json` and runs
   `npm publish --provenance --access public` (gated by `prepublishOnly` =
   build + lint + test). Requires the `NPM_TOKEN` repo secret.
