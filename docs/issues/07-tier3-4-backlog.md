# 07 — Tier 3/4 backlog

**Type:** AFK · **Labels:** backlog, needs-triage
**Parent:** [Build issues — next tiers](README.md)

## What to build

Lower-priority domains to pull off the backlog after the provisioning tier
(01–06) ships. Each becomes its own numbered issue when picked up, following the
same vertical-slice pattern + the shared
[Definition of Done](README.md#definition-of-done--applies-to-every-issue)
(mocked-response tests, fallow, n8n styleguide + conformance).

### Tier 3
- **In-App Purchases & Subscriptions** — `inAppPurchases` (v2), `subscriptionGroups`,
  `subscriptions`, `subscriptionPrices`, `promotedPurchases`, `subscriptionOfferCodes`.
  Large + deeply nested; scope to reads + price/state writes first. Candidate for
  its own **second node** if the field set balloons the single node's UX.
- **Pricing & Availability** — `appPricePoints`, `appPriceSchedules`, territory
  availability. Price-schedule model is fiddly.
- **Xcode Cloud (CI/CD)** — `ciProducts`, `ciWorkflows`, `ciBuildRuns` (start build),
  `ciBuildActions`, `scmRepositories`. "Start build → wait → notify" story.

### Tier 4 (niche — only on explicit request)
- **Sandbox Testers** — IAP sandbox: list, modify renewal rate, clear purchase
  history, interrupt purchases. (topfreegames has this — mine their ops.)
- **Analytics Reports** — `analyticsReportRequests` / `analyticsReports`: async
  request → poll → download-gzip flow; its own mini-project (no Vendor Number).
- **Sales & Finance Reports** — needs a Vendor Number; gzipped TSV, not JSON.
  Different transport handling — scope separately from the JSON resources.
- **Power & Performance Metrics**, **App Clips**, **App Store Version
  Experiments**, **Game Center**, **Alternative Distribution / Marketplaces**.

## Acceptance criteria

- [ ] Each item, when picked up, is promoted to its own numbered issue file
- [ ] Report/analytics endpoints (async / gzip / TSV) are scoped separately — they
      need different transport handling than the JSON:API resources
- [ ] IAP/Subscriptions evaluated for a dedicated second node before building inline

## Blocked by

- 01–06 (provisioning tier) ship first.
