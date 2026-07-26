/**
 * JSON:API resource type for App Store Connect user invitations — the `type` in
 * read responses (`GET /v1/userInvitations`) and the `data.type` on the Create
 * (`POST /v1/userInvitations`) request body.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (see `docs/apple-api-notes.md` and the
 * roadmap's "verify JSON:API resource-type strings against the live API"
 * guidance): doc-derived. If the live API rejects `userInvitations`, this is the
 * only line that needs to change.
 */
export const USER_INVITATION_RESOURCE_TYPE = 'userInvitations';
