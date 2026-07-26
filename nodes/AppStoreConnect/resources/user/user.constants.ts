/**
 * JSON:API resource type for App Store Connect users — the `type` in read
 * responses (`GET /v1/users`, `GET /v1/users/{id}`) and the `data.type` on the
 * Update Roles (`PATCH /v1/users/{id}`) request body.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (see `docs/apple-api-notes.md` and the
 * roadmap's "verify JSON:API resource-type strings against the live API"
 * guidance): doc-derived. If the live API rejects `users`, this is the only
 * line that needs to change.
 */
export const USER_RESOURCE_TYPE = 'users';
