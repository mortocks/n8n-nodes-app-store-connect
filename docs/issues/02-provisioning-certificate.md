# 02 — Provisioning: Certificate

**Type:** AFK · **Labels:** provisioning, needs-triage
**Parent:** [Build issues — next tiers](README.md) (Provisioning tier)

## What to build

The **Certificate** resource — signing certificates (development / distribution)
in the Apple Developer account.

- **Endpoints / operations:**
  - Get Many — `GET /v1/certificates` (filter by `certificateType`, `displayName`, `serialNumber`; sort)
  - Get — `GET /v1/certificates/{id}` (returns `certificateContent`, base64 DER)
  - Create — `POST /v1/certificates` (attributes: `csrContent` (PEM CSR), `certificateType`)
  - Revoke — `DELETE /v1/certificates/{id}` → `{ deleted: true }`
- **Constants (`⚠️`):** resource type `certificates`; `certificateType` enum (`IOS_DEVELOPMENT`, `IOS_DISTRIBUTION`, `MAC_APP_DISTRIBUTION`, `DEVELOPER_ID_APPLICATION`, `DISTRIBUTION`, `DEVELOPMENT`, …) — humanized labels + raw override.
- **Base64 content:** `Get` returns `attributes.certificateContent` (base64). Surface it usably (leave as-is in output; document that users can decode/write to a `.cer`). This is the one novel bit vs existing resources — note it in the resource doc-comment.
- Reads mount Query Options + Simplify + Sort; Create mounts Input Mode.

## Acceptance criteria

- [ ] Certificate: Get Many (filter by type + sort), Get (with `certificateContent`), Create (from CSR), Revoke verifiable in n8n
- [ ] `certificateType` dropdown humanized + raw-override; Revoke returns `{ deleted: true }`
- [ ] Base64 `certificateContent` surfaced in the Get output and documented
- [ ] Plus the shared [Definition of Done](README.md#definition-of-done--applies-to-every-issue)

## Blocked by

None (independent of Bundle ID).
