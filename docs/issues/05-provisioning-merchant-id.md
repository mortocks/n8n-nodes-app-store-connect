# 05 — Provisioning: Merchant ID (Apple Pay)

**Type:** AFK · **Labels:** provisioning, niche, needs-triage
**Parent:** [Build issues — next tiers](README.md) (Provisioning tier)

## What to build

The **Merchant ID** resource — Apple Pay merchant identifiers. Niche (Apple Pay
integrations only) — build after the core four (01–04).

- **Endpoints / operations:**
  - Get Many — `GET /v1/merchantIds` (filter by `identifier`, `name`; sort)
  - Get — `GET /v1/merchantIds/{id}`
  - Create — `POST /v1/merchantIds` (attributes: `name`, `identifier`)
  - Update — `PATCH /v1/merchantIds/{id}`
  - Delete — `DELETE /v1/merchantIds/{id}` → `{ deleted: true }`
  - List Certificates — `GET /v1/merchantIds/{id}/certificates`
- **Constants (`⚠️`):** resource type `merchantIds`.
- Reads mount Query Options + Simplify + Sort; writes mount Input Mode.

## Acceptance criteria

- [ ] Merchant ID: Get Many, Get, Create, Update, Delete, List Certificates verifiable in n8n
- [ ] Delete returns `{ deleted: true }`
- [ ] Plus the shared [Definition of Done](README.md#definition-of-done--applies-to-every-issue)

## Blocked by

None (independent). Lower priority than 01–04.
