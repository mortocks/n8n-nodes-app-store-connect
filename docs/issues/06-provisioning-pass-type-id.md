# 06 — Provisioning: Pass Type ID (Wallet)

**Type:** AFK · **Labels:** provisioning, niche, needs-triage
**Parent:** [Build issues — next tiers](README.md) (Provisioning tier)

## What to build

The **Pass Type ID** resource — Apple Wallet pass type identifiers. Niche
(Wallet passes only) — build after the core four (01–04).

- **Endpoints / operations:**
  - Get Many — `GET /v1/passTypeIds` (filter by `identifier`, `name`; sort)
  - Get — `GET /v1/passTypeIds/{id}`
  - Create — `POST /v1/passTypeIds` (attributes: `name`, `identifier`)
  - Update — `PATCH /v1/passTypeIds/{id}`
  - Delete — `DELETE /v1/passTypeIds/{id}` → `{ deleted: true }`
  - List Certificates — `GET /v1/passTypeIds/{id}/certificates`
- **Constants (`⚠️`):** resource type `passTypeIds`.
- Near-identical shape to Merchant ID (05) — the same patterns apply; keep them
  as separate resources (don't over-abstract), but you can lift the structure.
- Reads mount Query Options + Simplify + Sort; writes mount Input Mode.

## Acceptance criteria

- [ ] Pass Type ID: Get Many, Get, Create, Update, Delete, List Certificates verifiable in n8n
- [ ] Delete returns `{ deleted: true }`
- [ ] Plus the shared [Definition of Done](README.md#definition-of-done--applies-to-every-issue)

## Blocked by

None (independent). Lower priority than 01–04.
