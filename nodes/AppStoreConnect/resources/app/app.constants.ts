/**
 * JSON:API resource type for apps — the `type` in read responses
 * (`GET /v1/apps`, `GET /v1/apps/{id}`). Shared with the app picker
 * (`methods/apps.ts` → `APP_RESOURCE_TYPE`), duplicated here so the Apps
 * resource owns its own doc-derived constant alongside its siblings.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (see `docs/apple-api-notes.md` and the
 * roadmap's "verify JSON:API resource-type strings against the live API"
 * guidance): doc-derived. If the live API rejects `apps`, this is the only
 * line that needs to change.
 */
export const APP_RESOURCE_TYPE = 'apps';

/**
 * JSON:API resource type for app-info records — the `type` returned by
 * `GET /v1/apps/{id}/appInfos` (the per-app metadata container that owns the
 * localizations, categories, and age-rating declarations).
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (doc-derived). If the live API rejects
 * `appInfos`, this is the only line that needs to change.
 */
export const APP_INFO_RESOURCE_TYPE = 'appInfos';

/**
 * JSON:API resource type for app-info localizations — the `type` returned when
 * reading localizations and the `data.type` on the Update
 * (`PATCH /v1/appInfoLocalizations/{id}`) request body. These carry the
 * per-locale App Store metadata (name, subtitle, privacy policy).
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (doc-derived). If the live API rejects
 * `appInfoLocalizations`, this is the only line that needs to change.
 */
export const APP_INFO_LOCALIZATION_RESOURCE_TYPE = 'appInfoLocalizations';
