# 03 — Provisioning: Device

**Type:** AFK · **Labels:** provisioning, needs-triage
**Parent:** [Build issues — next tiers](README.md) (Provisioning tier)

## What to build

The **Device** resource — registered test devices (by UDID) in the Apple
Developer account.

- **Endpoints / operations:**
  - Get Many — `GET /v1/devices` (filter by `name`, `platform`, `status`, `udid`; sort)
  - Get — `GET /v1/devices/{id}`
  - Register — `POST /v1/devices` (attributes: `name`, `platform`, `udid`)
  - Update — `PATCH /v1/devices/{id}` (rename; toggle `status` ENABLED/DISABLED)
- **No delete:** Apple does not allow deleting devices — they can only be
  **disabled** via Update (`status: DISABLED`). Do NOT add a Delete operation;
  document this in the resource doc-comment.
- **Constants (`⚠️`):** resource type `devices`; `platform` enum (`IOS`, `MAC_OS`) humanized; `status` enum (`ENABLED`, `DISABLED`).
- Reads mount Query Options + Simplify + Sort; Register/Update mount Input Mode.

## Acceptance criteria

- [ ] Device: Get Many (filter + sort), Get, Register, Update (rename / enable / disable) verifiable in n8n
- [ ] No Delete op; "disable via Update" documented; enum labels humanized
- [ ] Plus the shared [Definition of Done](README.md#definition-of-done--applies-to-every-issue)

## Blocked by

None.
