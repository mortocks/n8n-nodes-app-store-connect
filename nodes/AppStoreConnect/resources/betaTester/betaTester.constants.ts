/**
 * JSON:API resource type for TestFlight beta testers — the `type` in read
 * responses (`GET /v1/betaTesters`, `GET /v1/betaTesters/{id}`), the `data.type`
 * on the Create/invite (`POST /v1/betaTesters`) request body, and the
 * resource-identifier `type` in the group-linkage relationship writes
 * (`POST` / `DELETE /v1/betaGroups/{id}/relationships/betaTesters`).
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (see `docs/apple-api-notes.md` and the
 * roadmap's "verify JSON:API resource-type strings against the live API"
 * guidance): doc-derived. If the live API rejects `betaTesters`, this is the
 * only line that needs to change.
 */
export const BETA_TESTER_RESOURCE_TYPE = 'betaTesters';
