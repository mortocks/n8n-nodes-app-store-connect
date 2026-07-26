# AGENTS.md

Conventions for anyone — human or coding agent — working in this repo. This is
the "rules of the road"; see [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup and
[`README.md`](README.md) for what the package does.

`n8n-nodes-app-store-connect` is an **n8n community node package** for the Apple
App Store Connect API. Get it right by following the conventions below — the CI
(lint + build + test on Node 20 & 22) and the test suite enforce most of them.

## Architecture

- **One declarative action node.** `App Store Connect` is a single node with
  **Resource + Operation** dropdowns (idiomatic n8n — Slack/Sheets/Notion style).
  **Do not** split it into per-resource or per-operation nodes. The Trigger and
  Verify nodes are separate because they must be.
- **A resource is a folder** under `nodes/AppStoreConnect/resources/<domain>/`:
  `*.resource.ts` (operations + fields), `*.body.ts` (JSON:API body builders /
  `preSend` hooks), `*.constants.ts` (resource-type strings, enums).
- **Reuse the shared layers — never reinvent them:**
  - `resources/_shared/` — `queryOptions` (filter/sort/include/fields escape
    hatch), `inputMode` (typed-or-raw-JSON on writes), `listFilters` (`sortField`
    + `attachSort` + tri-state), `simplify` (`simplifyField` + `simplifyJsonApi`),
    `appLocator`, `params`.
  - `transport/` — `ascCursorPagination` (list), `ascSingleRequest` (single),
    `ascConfirmationRequest(key)` (deletes → `{ deleted: true }`), `errors`
    (JSON:API `errors[]` → readable `NodeApiError`).
  - `methods/` — `searchApps`, `searchBetaGroups`, `getUserRoles` pickers.
  - `utils/` — the pure deep modules (JWT signer, HMAC verify, pagination, event
    types, error mapper).

## Testing (required, not optional)

- **Deep modules** (`utils/`) have pure unit tests with fixed vectors.
- **Every ASC-facing wiring** (routing hooks, `listSearch` pickers, the trigger
  lifecycle) MUST have unit tests that **mock App Store Connect HTTP responses** —
  mock `this.makeRoutingRequest` (declarative hooks) or
  `this.helpers.httpRequestWithAuthentication` (pickers / trigger). Assert request
  shape, pagination (`links.next`, Return All / Limit), filtering, and that ASC
  `errors[]` map to `NodeApiError`. Mocked-response tests are the bar; do not skip
  them for "framework wiring".
- **Conformance** — `nodes/conformance.test.ts` checks every node/credential
  description against n8n UX conventions. Keep it green; when you add a
  resource/field it is validated automatically.
- Run `npm test` — all suites must pass.

## Code health — run fallow before "done"

Run `npx fallow dead-code` and `npx fallow dupes` and fix issues **in the code you
touched** (unused exports, new duplication, complexity). Reuse a `_shared` helper
rather than copy-pasting.

> Known false-positive to IGNORE: fallow can't resolve n8n's `dist/` entry points
> (declared in `package.json`'s `n8n` block), so it flags the whole node graph
> (`*.node.ts`, credentials, webhook resource) as "unused files". That's baseline
> noise — only act on findings in *your* files.

## n8n UX guidelines (enforced by the conformance test)

Follow <https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines/>:

- **Title Case** display names / operation names / dropdown titles; **sentence
  case** descriptions, actions, and option descriptions.
- Boolean parameter descriptions start with **"Whether to…"**.
- Placeholders begin with **`e.g. `** and use realistic demo content.
- Single-item selection uses a **resourceLocator** with a **From List** mode.
- **Reads**: offer a **Simplify** toggle (`simplifyField`) and mount the generic
  **Query Options** collection alongside curated typed filters + a **Sort** field.
- **Writes**: offer the **Input Mode** toggle (typed fields _or_ raw JSON body).
- **Deletes** return `{ deleted: true }` (use `ascConfirmationRequest`), never an
  empty 204 body.
- Humanize enum dropdown labels (keep the SCREAMING_SNAKE value, show a friendly
  `name` — e.g. `IOS` → "iOS"). Keep option lists alphabetical by name (linter).
- Mask secrets with `typeOptions: { password: true }`.

## App Store Connect API discipline

- Doc-derived JSON:API **resource-type strings**, **`filter[...]` keys**, and
  **sort values** are unverified until a live 2xx confirms them. Keep them in
  `*.constants.ts`, mark them `⚠️`, and verify enum values against the ASC OpenAPI
  spec before shipping. See [`docs/apple-api-notes.md`](docs/apple-api-notes.md)
  for the confirmed vs unconfirmed facts.
- Never ship a `filter`/`sort` value the spec doesn't list — omit the control
  instead (e.g. `appStoreVersions` has no `sort`).

## Definition of done

1. `npm run lint` — clean.
2. `npm run build` — clean (this is also the type-check; ts-jest runs with
   diagnostics off).
3. `npm test` — all suites pass, including conformance.
4. `npx fallow dead-code` / `dupes` — no new findings in your files.
5. For changes with runtime surface, verify in a local n8n:
   `npm run docker:refresh` → http://localhost:5678.

## Don't commit

`.claude/`, `.superpowers/`, `dist/`, `node_modules/`, `docker/*.tgz` — all
gitignored (build output, tool scratch, machine-local config). Planned work goes
in **GitHub Issues**, not `docs/`.
