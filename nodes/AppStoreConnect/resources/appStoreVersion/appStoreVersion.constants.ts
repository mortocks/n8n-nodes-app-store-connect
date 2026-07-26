/**
 * JSON:API resource-type strings and enum sets for the App Store Version &
 * Release domain — the release pipeline (versions, per-locale metadata, review
 * submission, manual release, phased release).
 *
 * Every `*_RESOURCE_TYPE` is the `type` an ASC read response carries and the
 * `data.type` a write body must send. They are gathered here (one file) so a
 * single live-2xx check can confirm the whole family and any correction is a
 * one-line edit — the same discipline the webhook work learned
 * (`webhooks` vs `webhookConfigurations`).
 */

/**
 * JSON:API resource type for App Store versions — the `type` in read responses
 * (`GET /v1/apps/{id}/appStoreVersions`, `GET /v1/appStoreVersions/{id}`), the
 * `data.type` on Create (`POST /v1/appStoreVersions`) / Update
 * (`PATCH /v1/appStoreVersions/{id}`), and the resource-identifier `type` in the
 * `appStoreVersion` relationship of a review-submission item, release request,
 * and phased release.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (see `docs/apple-api-notes.md` and the
 * roadmap's "verify JSON:API resource-type strings against the live API"
 * guidance): doc-derived. If the live API rejects `appStoreVersions`, this is
 * the only line that needs to change.
 */
export const APP_STORE_VERSION_RESOURCE_TYPE = 'appStoreVersions';

/**
 * JSON:API resource type for per-locale App Store version metadata (What's New,
 * description, keywords, etc.) — the `type` in read responses
 * (`GET /v1/appStoreVersions/{id}/appStoreVersionLocalizations`) and the
 * `data.type` on Update (`PATCH /v1/appStoreVersionLocalizations/{id}`).
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (doc-derived). If the live API rejects
 * `appStoreVersionLocalizations`, this is the only line that needs to change.
 */
export const APP_STORE_VERSION_LOCALIZATION_RESOURCE_TYPE = 'appStoreVersionLocalizations';

/**
 * JSON:API resource type for the modern review-submission container — the
 * `data.type` on Create (`POST /v1/reviewSubmissions`) and the
 * resource-identifier `type` in a submission item's `reviewSubmission`
 * relationship. A review submission groups the version(s) being submitted for a
 * given app + platform; items are added to it, then it is submitted.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (doc-derived). If the live API rejects
 * `reviewSubmissions`, this is the only line that needs to change.
 */
export const REVIEW_SUBMISSION_RESOURCE_TYPE = 'reviewSubmissions';

/**
 * JSON:API resource type for an item inside a review submission — the
 * `data.type` on Create (`POST /v1/reviewSubmissionItems`). Each item links a
 * concrete `appStoreVersion` (or other reviewable) into its parent
 * `reviewSubmission`.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (doc-derived). If the live API rejects
 * `reviewSubmissionItems`, this is the only line that needs to change.
 */
export const REVIEW_SUBMISSION_ITEM_RESOURCE_TYPE = 'reviewSubmissionItems';

/**
 * JSON:API resource type for a manual-release request — the `data.type` on
 * Create (`POST /v1/appStoreVersionReleaseRequests`). Creating one releases an
 * approved version that is waiting for a manual "Release this version" action.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (doc-derived). If the live API rejects
 * `appStoreVersionReleaseRequests`, this is the only line that needs to change.
 */
export const APP_STORE_VERSION_RELEASE_REQUEST_RESOURCE_TYPE = 'appStoreVersionReleaseRequests';

/**
 * JSON:API resource type for a phased (staged) release — the `data.type` on
 * Create (`POST /v1/appStoreVersionPhasedReleases`) and Update
 * (`PATCH /v1/appStoreVersionPhasedReleases/{id}`). Controls the 7-day gradual
 * rollout: create to opt a version in, PATCH `phasedReleaseState` to
 * pause / resume / complete it.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (doc-derived). If the live API rejects
 * `appStoreVersionPhasedReleases`, this is the only line that needs to change.
 */
export const APP_STORE_VERSION_PHASED_RELEASE_RESOURCE_TYPE = 'appStoreVersionPhasedReleases';

/**
 * Platforms an App Store version / review submission can target — Apple's
 * `Platform` enum, offered as a dropdown on Version Create and Submit for
 * Review while still allowing any raw value through the JSON escape hatch.
 *
 * ⚠️ Doc-derived enum — confirm against a live 2xx if Apple adds platforms.
 */
export const APP_STORE_PLATFORMS = ['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS'] as const;

/**
 * `appStoreState` values a version can be in — the classic App Store review /
 * release lifecycle. Offered as the Get Many `filter[appStoreState]` dropdown so
 * users can narrow a version list to e.g. `READY_FOR_SALE` or `IN_REVIEW`, while
 * the generic Query Options collection stays the escape hatch for the newer
 * `filter[appVersionState]`.
 *
 * ⚠️ Doc-derived enum, verified against the App Store Connect OpenAPI spec
 * (v4.3) for `GET /v1/apps/{id}/appStoreVersions` — confirm against a live 2xx.
 */
export const APP_STORE_STATES = [
	'ACCEPTED',
	'DEVELOPER_REMOVED_FROM_SALE',
	'DEVELOPER_REJECTED',
	'IN_REVIEW',
	'INVALID_BINARY',
	'METADATA_REJECTED',
	'PENDING_APPLE_RELEASE',
	'PENDING_CONTRACT',
	'PENDING_DEVELOPER_RELEASE',
	'PREPARE_FOR_SUBMISSION',
	'PREORDER_READY_FOR_SALE',
	'PROCESSING_FOR_APP_STORE',
	'READY_FOR_REVIEW',
	'READY_FOR_SALE',
	'REJECTED',
	'REMOVED_FROM_SALE',
	'WAITING_FOR_EXPORT_COMPLIANCE',
	'WAITING_FOR_REVIEW',
	'REPLACED_WITH_NEW_VERSION',
	'NOT_APPLICABLE',
] as const;

/**
 * `releaseType` values a version can be set to — how an approved version goes
 * live: `MANUAL` (wait for a release request), `AFTER_APPROVAL` (auto-release on
 * approval), or `SCHEDULED` (release at `earliestReleaseDate`).
 *
 * ⚠️ Doc-derived enum — confirm against a live 2xx.
 */
export const APP_STORE_VERSION_RELEASE_TYPES = ['MANUAL', 'AFTER_APPROVAL', 'SCHEDULED'] as const;

/**
 * `phasedReleaseState` values — the lifecycle of a staged rollout. Set on a
 * phased-release Update to pause (`PAUSED`), resume (`ACTIVE`), or finish
 * releasing to everyone immediately (`COMPLETE`); `INACTIVE` is the freshly
 * created, not-yet-started state.
 *
 * ⚠️ Doc-derived enum — confirm against a live 2xx.
 */
export const APP_STORE_VERSION_PHASED_RELEASE_STATES = [
	'INACTIVE',
	'ACTIVE',
	'PAUSED',
	'COMPLETE',
] as const;
