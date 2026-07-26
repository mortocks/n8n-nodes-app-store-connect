/**
 * JSON:API resource type for builds — the `type` in read responses
 * (`GET /v1/builds`, `GET /v1/builds/{id}`) and the `data.type` on the Update
 * (`PATCH /v1/builds/{id}`) request body.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (see `docs/apple-api-notes.md` and the
 * roadmap's "verify JSON:API resource-type strings against the live API"
 * guidance): doc-derived. If the live API rejects `builds`, this is the only
 * line that needs to change.
 */
export const BUILD_RESOURCE_TYPE = 'builds';

/**
 * JSON:API resource type for pre-release (TestFlight) versions — the `type`
 * returned by `GET /v1/preReleaseVersions` and referenced by the Get Many
 * `filter[preReleaseVersion]` filter.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (doc-derived). If the live API rejects
 * `preReleaseVersions`, this is the only line that needs to change.
 */
export const PRE_RELEASE_VERSION_RESOURCE_TYPE = 'preReleaseVersions';

/**
 * JSON:API resource type for a build's beta detail — the `type` returned by
 * `GET /v1/builds/{id}/buildBetaDetail` (the TestFlight review / external build
 * state sub-resource).
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (doc-derived). If the live API rejects
 * `buildBetaDetails`, this is the only line that needs to change.
 */
export const BUILD_BETA_DETAIL_RESOURCE_TYPE = 'buildBetaDetails';

/**
 * Valid `processingState` values a build can be filtered by
 * (`filter[processingState]`). Apple exposes these on `GET /v1/builds`; the
 * curated Get Many filter offers them as a dropdown while still allowing any
 * raw filter through the shared Query Options collection.
 *
 * ⚠️ Doc-derived enum — confirm against a live 2xx if Apple adds states.
 */
export const BUILD_PROCESSING_STATES = ['PROCESSING', 'FAILED', 'INVALID', 'VALID'] as const;
