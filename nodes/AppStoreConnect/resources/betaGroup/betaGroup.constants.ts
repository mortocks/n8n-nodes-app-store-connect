/**
 * JSON:API resource type for TestFlight beta groups — the `type` in read
 * responses (`GET /v1/betaGroups`, `GET /v1/betaGroups/{id}`), the `data.type`
 * on the Create (`POST /v1/betaGroups`) / Update (`PATCH /v1/betaGroups/{id}`)
 * request bodies, and the resource-identifier `type` in the tester-linkage
 * relationship (`.../relationships/betaTesters`) and on a tester's
 * `relationships.betaGroups`.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (see `docs/apple-api-notes.md` and the
 * roadmap's "verify JSON:API resource-type strings against the live API"
 * guidance): doc-derived. If the live API rejects `betaGroups`, this is the only
 * line that needs to change.
 */
export const BETA_GROUP_RESOURCE_TYPE = 'betaGroups';

/**
 * JSON:API resource type for beta-group invitations — the modern TestFlight
 * "invite an existing tester to a group" flow (`POST /v1/betaGroupInvitations`).
 * Not yet surfaced as its own operation (Beta Tester Create/Add-to-Group cover
 * the onboarding cases today); kept here so the string is version-controlled and
 * flagged for the same live check as the other type strings, ready for a future
 * dedicated invitation operation.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (doc-derived). If the live API rejects
 * `betaGroupInvitations`, this is the only line that needs to change.
 */
export const BETA_GROUP_INVITATION_RESOURCE_TYPE = 'betaGroupInvitations';
