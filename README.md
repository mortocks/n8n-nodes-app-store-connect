# n8n nodes for App Store Connect

[![npm version](https://img.shields.io/npm/v/n8n-nodes-app-store-connect.svg)](https://www.npmjs.com/package/n8n-nodes-app-store-connect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**`n8n-nodes-app-store-connect`** — [n8n](https://n8n.io) community nodes
for the [Apple App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi).
Automate TestFlight, builds, App Store versions, customer reviews, users, and
webhooks — connect your credentials once and build workflows, no bespoke webhook
receivers or hand-rolled JWTs.

> Not an official Apple product. "App Store Connect" and "Apple" are trademarks of
> Apple Inc. This is an independent integration and ships a neutral custom icon.

---

## Highlights

- **10 resources** on one action node — App, App Store Version, Build, Beta Group,
  Beta Tester, Beta Feedback, Customer Review, User, User Invitation, Webhook.
- **Trigger node** — start workflows on App Store Connect webhook events, with
  HMAC signature verification (secure by default).
- **Auth handled for you** — store a Team or Individual API key once; the
  credential mints a short-lived ES256 JWT per request and re-mints on expiry.
  Nothing long-lived is stored.
- **Typed filters + sort** on every list, plus a generic Query Options escape
  hatch (`filter[]`, `sort`, `include`, sparse `fields[]`).
- **Simplify** toggle flattens the JSON:API envelope to clean, flat items.
- **Typed UI _or_ raw JSON** on every write — hand-write the JSON:API body when
  Apple ships a field before this package does.
- **Searchable pickers** (apps by name/bundle ID; beta groups, app-scopable),
  **cursor pagination** (Return All / Limit), **readable errors**, and
  **Continue On Fail** throughout.
- **Usable as an AI tool** — every operation is exposable to n8n AI Agent nodes.

## Installation

From the n8n UI: **Settings → Community Nodes → Install**, and enter:

```
n8n-nodes-app-store-connect
```

Or on self-hosted n8n:

```bash
npm install n8n-nodes-app-store-connect
```

**Compatibility:** Node.js ≥ 20.15; tested against n8n 2.31.x.

## Quick start

1. **Create credentials** — add an **App Store Connect API** credential (see
   [Credentials](#credentials)).
2. **React to reviews:** add the **App Store Connect** node → Resource **Customer
   Review** → **Get Many**, pick your app, filter by rating, and wire it into a
   Slack/email node. (Turn **Simplify** on for flat items.)
3. **React to events:** add the **App Store Connect Trigger**, point it at your
   app, choose events (e.g. build upload state changes, TestFlight feedback), and
   the workflow starts on each verified delivery.

---

## Nodes

### App Store Connect (action)

A single node with **Resource** + **Operation** dropdowns.

| Resource | Operations |
| --- | --- |
| **App** | Get Many, Get, Get App Info, Update App Info Localization |
| **App Store Version** | Get Many, Get, Create, Update · Localizations: Get Many, Update (What's New) · Submit for Review, Add Submission Item, Release, Phased Release (Create / Update) |
| **Build** | Get Many, Get, Get Beta Detail, Update (expire / encryption) |
| **Beta Group** | Get Many, Get, Create, Update, Delete |
| **Beta Tester** | Get Many, Get, Create (invite), Delete, Add to Group, Remove from Group |
| **Beta Feedback** | Get Many, Get, Delete (crash & screenshot submissions) |
| **Customer Review** | Get Many, Get · Response: Get, Create, Update, Delete |
| **User** | Get Many, Get, Update Roles, Remove |
| **User Invitation** | Get Many, Create, Delete |
| **Webhook** | Get Many, Get, Create, Update, Delete, Send Test Ping, List Deliveries |

**Working with lists.** Get Many operations expose the API's documented filters as
typed fields (e.g. Build → processing state; Customer Review → rating/territory)
and a **Sort** dropdown. For anything not surfaced, the **Query Options**
collection accepts raw `filter[key]`, `sort`, `include`, and sparse `fields[type]`.
**Return All** follows `links.next`; otherwise set a **Limit**.

**Writing data.** Create/Update operations offer an **Input Mode** toggle:
**Fields** (the typed UI) or **JSON** (send a raw JSON:API `data` object). The JSON
mode is a deliberate escape hatch — perform an action immediately if the API adds
an attribute before the node is updated. Delete operations return
`{ "deleted": true }` rather than an empty body.

**Pickers.** The **Target App** field is a searchable resource locator (by name /
bundle ID, or by ID / expression). The **Beta Group** picker can be narrowed to a
chosen app.

### App Store Connect Trigger

Starts a workflow when App Store Connect delivers a webhook event.

- **Passive by default** — register the webhook yourself (via the Webhook resource
  or the ASC console) pointing at this node's URL; the trigger just verifies and
  emits. No API calls, ideal for local testing.
- **Optional auto-manage** — turn on *Manage Webhook* and the trigger registers the
  webhook on activation (reusing an existing one — no duplicates) and deletes it on
  deactivation.
- **Secure by default** — every delivery's `x-apple-signature` HMAC is verified;
  a missing/invalid signature gets a 401 and the workflow does **not** run.
- **Emits** the parsed payload plus `eventType`, `deliveryId`, and `isPing`.
- A clearly-labelled *Skip Signature Validation* toggle exists for local debugging
  (unsafe — off in production).

### Verify Webhook Signature

A standalone node to validate an App Store Connect delivery when you receive it via
n8n's generic **Webhook** node (configured to keep the **raw body**). Feed it the
raw body, the `x-apple-signature` header, and the secret (from a credential or a
field); it outputs a boolean `valid` to branch on. Timing-safe and fails closed.
It shares one implementation with the Trigger, so behaviour can't drift.

---

## Credentials

### App Store Connect API

Create a key in App Store Connect under **Users and Access → Integrations → App
Store Connect API**, then fill in:

- **Key Type** — `Team` (shared across a developer team) or `Individual` (a single
  Apple ID). Individual keys omit the Issuer ID.
- **Key ID** — shown next to the key.
- **Issuer ID** — the UUID above the key list (Team keys only).
- **Private Key** — the full contents of the downloaded `.p8` file (including the
  `-----BEGIN/END PRIVATE KEY-----` lines).

The credential signs a fresh ES256 JWT (audience `appstoreconnect-v1`, ~19-minute
expiry) per request; n8n caches and re-mints it. It has a built-in test against a
harmless endpoint.

### App Store Connect Webhook

A minimal credential holding **only the shared Secret** you set on the webhook. Used
by the Trigger and Verify nodes to check `x-apple-signature`. Keep it separate from
the API key — a workflow that only verifies deliveries needs the secret, not the
ES256 key material.

**Signature format:** header `x-apple-signature: hmacsha256=<lowercase-hex>`, an
HMAC-SHA256 of the **raw** request body keyed by the Secret.

---

## Contributing

Contributions welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full
guide. In short:

```bash
npm ci
npm run build          # tsc + icons → dist/  (also the type-check)
npm run lint           # eslint-plugin-n8n-nodes-base
npm test               # jest (deep modules, mocked-ASC wiring, conformance)
npm run docker:refresh # rebuild + run a local n8n with the package preloaded
```

- The action node is **declarative**; each resource is a self-contained folder
  under `nodes/AppStoreConnect/resources/<domain>/`. Reuse the shared helpers
  (`resources/_shared/`, `transport/`, `methods/`) rather than reinventing request,
  pagination, error, filter/sort, simplify, or input-mode plumbing.
- **Testing bar:** deep modules have pure unit tests; ASC-facing wiring has tests
  that **mock App Store Connect HTTP responses**; `nodes/conformance.test.ts`
  enforces n8n UX conventions across every node/credential. Keep all green.
- Doc-derived JSON:API type strings / filter keys are marked `⚠️` in code until
  confirmed against a live 2xx — please verify against a real account when you can.
- Planned work and roadmap are tracked in
  [GitHub Issues](https://github.com/mortocks/n8n-nodes-app-store-connect/issues).
- Conventions for contributors (and coding agents) live in [`AGENTS.md`](AGENTS.md).

Open an issue with the templates provided, or a PR against `main` (CI runs lint +
build + test on Node 20 & 22).

## License

[MIT](LICENSE) © Andrew Morton
