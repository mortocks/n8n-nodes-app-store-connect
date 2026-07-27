# Build issues — next tiers

Local build specs for the remaining resources of `n8n-nodes-apple-appstore`.
`v0.1.0` is **shipped** (Webhooks + Trigger + Verify, TestFlight, Builds, App
Store Versions, Customer Reviews, Apps, Users) — these track what's next, so the
package becomes a full-service Apple App Store Connect + Developer-portal suite.

Each issue is a vertical slice built by one subagent, following the patterns in
[`../../AGENTS.md`](../../AGENTS.md).

## Order

**Provisioning tier** (Apple Developer portal — certs / identifiers / profiles):

1. [01 — Bundle ID](01-provisioning-bundle-id.md)
2. [02 — Certificate](02-provisioning-certificate.md)
3. [03 — Device](03-provisioning-device.md)
4. [04 — Profile](04-provisioning-profile.md)
5. [05 — Merchant ID](05-provisioning-merchant-id.md) *(Apple Pay — niche)*
6. [06 — Pass Type ID](06-provisioning-pass-type-id.md) *(Wallet — niche)*

**Backlog:** [07 — Tier 3/4 backlog](07-tier3-4-backlog.md) (IAP & Subscriptions,
Pricing & Availability, Xcode Cloud, Analytics/Sales reports).

**Verification hardening** (to pass `@n8n/scan-community-package` for the n8n
verified-community-node program — do these **in order**, they share node/credential files):

1. [verify-01 — Neutral SVG icons](verify-01-svg-icons.md)
2. [verify-02 — NodeConnectionTypes](verify-02-node-connection-types.md)
3. [verify-03 — Wrap raw re-throws in NodeApiError](verify-03-node-api-error.md)
4. [verify-04 — Webhook credential compliance](verify-04-webhook-credential.md)
5. [verify-05 — Author email, usableAsTool, title-case](verify-05-metadata-and-lint.md)

After all merge: publish `0.1.2` via the release workflow and re-run
`npx @n8n/scan-community-package n8n-nodes-apple-appstore` — it must be green.

## Definition of done — applies to EVERY issue

These are mandatory for every slice (not repeated in full per file):

- [ ] **Placement:** new resource(s) on the single **App Store Connect** action
      node (add to the Resource dropdown). Reuse the shared layers — credential,
      `transport/` (`ascCursorPagination`, `ascSingleRequest`,
      `ascConfirmationRequest`), `resources/_shared/` (`queryOptions`,
      `inputMode`, `listFilters`, `simplify`, `appLocator`, `params`). Do **not**
      reinvent request/pagination/error/filter/simplify/input-mode plumbing.
- [ ] **Unit tests that mock App Store Connect HTTP responses** for all new
      ASC-facing wiring — mock `this.makeRoutingRequest` (declarative hooks) or
      `this.helpers.httpRequestWithAuthentication` (pickers). Assert request
      shape, pagination (`links.next`, Return All / Limit), filtering, and that
      ASC `errors[]` map to `NodeApiError`. Cover both input modes on writes.
- [ ] **n8n UX styleguide** (<https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines/>):
      Title Case labels/ops, sentence-case descriptions, "Whether to…" booleans,
      `e.g. ` placeholders, resourceLocator with a From-List mode, **Simplify**
      on reads, **`{ deleted: true }`** on deletes (via `ascConfirmationRequest`),
      humanized enum labels (SCREAMING_SNAKE value, friendly `name`, alphabetical).
      Keep **`nodes/conformance.test.ts` green**.
- [ ] **Run fallow** (`npx fallow dead-code` / `dupes`); no new findings in your
      files (ignore the known dist/ entry-point false-positive).
- [ ] **Verify:** `npm run lint`, `npm run build`, `npm test` all clean.
- [ ] Doc-derived JSON:API resource-type strings, `filter[...]` keys, and enum
      values marked `⚠️` in `*.constants.ts` until confirmed against a live 2xx
      (verify enums against the ASC OpenAPI spec before shipping).
- [ ] Ships as its own branch → PR through the CI + branch-protection gates.

Reference: topfreegames' MIT `@topfreegames/n8n-nodes-appstore` covers this
surface — mine its operation list + field sets to accelerate (with attribution),
but implement to our bar (declarative, tested, error-mapped, Team+Individual auth).
