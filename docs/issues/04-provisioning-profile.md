# 04 — Provisioning: Profile

**Type:** AFK · **Labels:** provisioning, needs-triage
**Parent:** [Build issues — next tiers](README.md) (Provisioning tier)

## What to build

The **Profile** resource — provisioning profiles that bind a bundle ID +
certificates + devices for signing.

- **Endpoints / operations:**
  - Get Many — `GET /v1/profiles` (filter by `name`, `profileType`, `profileState`; sort)
  - Get — `GET /v1/profiles/{id}` (returns `profileContent`, base64 `.mobileprovision`)
  - Create — `POST /v1/profiles` (attributes: `name`, `profileType`; relationships: `bundleId` (required), `certificates` (to-many), `devices` (to-many, for development/ad-hoc types))
  - Delete — `DELETE /v1/profiles/{id}` → `{ deleted: true }`
  - Relationships (reads): `GET /v1/profiles/{id}/bundleId`, `/certificates`, `/devices`
- **Constants (`⚠️`):** resource type `profiles`; `profileType` enum (`IOS_APP_DEVELOPMENT`, `IOS_APP_STORE`, `IOS_APP_ADHOC`, `MAC_APP_DEVELOPMENT`, `MAC_APP_STORE`, `TVOS_APP_*`, …) humanized; `profileState` (`ACTIVE`, `INVALID`).
- **Base64 content:** `Get` returns `attributes.profileContent` (base64). Surface it (as with Certificate). The Create body is the most relationship-heavy write in the package — reuse the bundle-id / certificate / device pickers where sensible (a Bundle ID picker from issue 01; certificate/device IDs can be plain strings or pickers if cheap).
- Reads mount Query Options + Simplify + Sort; Create mounts Input Mode.

## Acceptance criteria

- [ ] Profile: Get Many (filter + sort), Get (with `profileContent`), Create (bundleId + certificates + devices), Delete verifiable in n8n
- [ ] `profileType` humanized; relationships assembled correctly; Delete returns `{ deleted: true }`
- [ ] Base64 `profileContent` surfaced + documented
- [ ] Plus the shared [Definition of Done](README.md#definition-of-done--applies-to-every-issue)

## Blocked by

- 01 (Bundle ID) — nice-to-have if reusing a bundle-id picker; can proceed with a plain bundle-id string field if 01 isn't merged yet.
