# 01 — Provisioning: Bundle ID

**Type:** AFK · **Labels:** provisioning, needs-triage
**Parent:** [Build issues — next tiers](README.md) (Provisioning tier)

## What to build

The **Bundle ID** resource on the App Store Connect node, plus its capabilities
sub-resource. Bundle IDs are the app-identifier records in the Apple Developer
account (used for provisioning, push, App Groups, etc.).

- **Endpoints / operations:**
  - Get Many — `GET /v1/bundleIds` (filter by `identifier`, `name`, `platform`, `seedId`; sort)
  - Get — `GET /v1/bundleIds/{id}`
  - Register — `POST /v1/bundleIds` (attributes: `name`, `identifier`, `platform`, optional `seedId`)
  - Update — `PATCH /v1/bundleIds/{id}` (rename)
  - Delete — `DELETE /v1/bundleIds/{id}` → `{ deleted: true }`
  - List Capabilities — `GET /v1/bundleIds/{id}/bundleIdCapabilities`
  - List Profiles — `GET /v1/bundleIds/{id}/profiles`
  - Get App relationship — `GET /v1/bundleIds/{id}/app` (or relationships/app)
  - **Capabilities (sub-resource):** Enable — `POST /v1/bundleIdCapabilities`; Modify — `PATCH /v1/bundleIdCapabilities/{id}`; Disable — `DELETE /v1/bundleIdCapabilities/{id}` → `{ deleted: true }`
- **Constants (`⚠️` until live-confirmed):** resource types `bundleIds`, `bundleIdCapabilities`; `platform` enum (`IOS`, `MAC_OS`, `UNIVERSAL`) — humanize labels (iOS / macOS / Universal); capability-type enum (`ICLOUD`, `IN_APP_PURCHASE`, `PUSH_NOTIFICATIONS`, `APP_GROUPS`, …) as a dropdown + raw-override for the long tail.
- Reads mount Query Options + Simplify + Sort; writes mount Input Mode (typed + raw-JSON).

## Acceptance criteria

- [ ] Bundle ID: Get Many (with filters + sort), Get, Register, Update, Delete verifiable in n8n
- [ ] Capabilities: Enable / Modify / Disable work; capability type + settings modelled (dropdown + raw override)
- [ ] Delete/Disable return `{ deleted: true }`; enum labels humanized
- [ ] Plus the shared [Definition of Done](README.md#definition-of-done--applies-to-every-issue): mocked-response unit tests, fallow clean, n8n styleguide + conformance green, `⚠️` type strings, shared-helper reuse

## Blocked by

None — first provisioning slice; establishes the `resources/bundleId/` folder others reference.
