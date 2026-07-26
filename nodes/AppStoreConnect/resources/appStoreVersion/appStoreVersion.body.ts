import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

import { resolveMutationData } from '../_shared/inputMode';
import { APP_RESOURCE_TYPE } from '../../methods/apps';
import {
	APP_STORE_VERSION_LOCALIZATION_RESOURCE_TYPE,
	APP_STORE_VERSION_PHASED_RELEASE_RESOURCE_TYPE,
	APP_STORE_VERSION_RELEASE_REQUEST_RESOURCE_TYPE,
	APP_STORE_VERSION_RESOURCE_TYPE,
	REVIEW_SUBMISSION_ITEM_RESOURCE_TYPE,
	REVIEW_SUBMISSION_RESOURCE_TYPE,
} from './appStoreVersion.constants';

/**
 * JSON:API request-body builders for the App Store Version & Release domain.
 *
 * Every write flows through the shared Input Mode escape hatch: each exported
 * `preSend` hook calls `resolveMutationData`, so in `fields` mode it assembles
 * the body from the typed UI (the `buildTyped*` helpers below) and in `json`
 * mode it sends the user's raw JSON:API `data` object verbatim. Either way the
 * node owns the wrapping `{ data }` envelope, URL, method, and auth, and the
 * response runs through the same `ascSingleRequest` + module-D error mapper.
 *
 * The `buildTyped*` helpers are only reached in `fields` mode.
 */

// --- Versions: Get Many filters --------------------------------------------

/**
 * `preSend` hook for App Store Versions Get Many
 * (`GET /v1/apps/{id}/appStoreVersions`) that folds the curated convenience
 * filters into JSON:API `filter[...]` query params.
 *
 * Versions are app-scoped via the URL, so the app is *not* a filter here — only
 * the version-level facets are. Only filters the user actually set are written,
 * and everything merges onto any existing `qs`, so it composes with the shared
 * `attachQueryOptions` hook. Runs *before* `attachQueryOptions` in the `preSend`
 * chain; both only add keys, so order is immaterial.
 *
 * Filter keys verified against the App Store Connect OpenAPI spec (v4.3):
 * `filter[versionString]`, `filter[platform]` (the `Platform` enum), and
 * `filter[appStoreState]` are listed on this endpoint. ⚠️ NOTE: this endpoint
 * exposes **no `sort` parameter** in the spec, so there is deliberately no Sort
 * dropdown / `attachSort` for this Get Many. ⚠️ Confirm against a live 2xx.
 */
export async function attachAppStoreVersionFilters(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const qs: IDataObject = { ...(requestOptions.qs ?? {}) };

	const versionString = (this.getNodeParameter('filterVersionString', '') as string)?.trim();
	if (versionString) {
		qs['filter[versionString]'] = versionString;
	}

	const platform = (this.getNodeParameter('filterPlatform', '') as string)?.trim();
	if (platform) {
		qs['filter[platform]'] = platform;
	}

	const appStoreState = (this.getNodeParameter('filterAppStoreState', '') as string)?.trim();
	if (appStoreState) {
		qs['filter[appStoreState]'] = appStoreState;
	}

	requestOptions.qs = qs;
	return requestOptions;
}

// --- Versions: Create / Update ---------------------------------------------

/**
 * Copy the optional version attributes the user set into `attributes`. Shared by
 * Create (`additionalFields`) and Update (`updateFields`); each is only written
 * when present, so a PATCH never clobbers an attribute left alone.
 */
function assignVersionAttributes(attributes: IDataObject, source: IDataObject): void {
	if (source.releaseType !== undefined && source.releaseType !== '') {
		attributes.releaseType = source.releaseType;
	}
	if (source.earliestReleaseDate !== undefined && source.earliestReleaseDate !== '') {
		attributes.earliestReleaseDate = source.earliestReleaseDate;
	}
	if (source.copyright !== undefined && source.copyright !== '') {
		attributes.copyright = source.copyright;
	}
	if (source.downloadable !== undefined) {
		attributes.downloadable = source.downloadable;
	}
	if (source.versionString !== undefined && source.versionString !== '') {
		attributes.versionString = source.versionString;
	}
}

/**
 * Assemble the typed `data` object for a version write.
 *
 * - **Create** (`POST /v1/appStoreVersions`): required `versionString` +
 *   `platform` attributes, any optional attributes, and a required `app`
 *   relationship (read from the `targetApp` picker).
 * - **Update** (`PATCH /v1/appStoreVersions/{id}`): only the attributes the user
 *   set (`updateFields`) + the version's own `id` (read from
 *   `appStoreVersionId`); ASC keys the PATCH off the URL id.
 */
function buildTypedVersionData(ctx: IExecuteSingleFunctions, operation: string): IDataObject {
	const attributes: IDataObject = {};

	if (operation === 'create') {
		attributes.versionString = ctx.getNodeParameter('versionString', '') as string;
		attributes.platform = ctx.getNodeParameter('platform', '') as string;
		const additionalFields = ctx.getNodeParameter('additionalFields', {}) as IDataObject;
		assignVersionAttributes(attributes, additionalFields);

		const appId = ctx.getNodeParameter('targetApp', '', { extractValue: true }) as string;
		return {
			type: APP_STORE_VERSION_RESOURCE_TYPE,
			attributes,
			relationships: {
				app: {
					data: { type: APP_RESOURCE_TYPE, id: appId },
				},
			},
		};
	}

	// update
	const updateFields = ctx.getNodeParameter('updateFields', {}) as IDataObject;
	assignVersionAttributes(attributes, updateFields);

	const versionId = ctx.getNodeParameter('appStoreVersionId') as string;
	return {
		type: APP_STORE_VERSION_RESOURCE_TYPE,
		id: versionId,
		attributes,
	};
}

/** `preSend` hook shared by version Create and Update. */
export async function attachVersionBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const operation = this.getNodeParameter('operation') as string;

	const data = resolveMutationData(this, () => buildTypedVersionData(this, operation));

	requestOptions.body = { data };
	return requestOptions;
}

// --- Localizations: Update -------------------------------------------------

/**
 * Assemble the typed `data` object for a version-localization Update
 * (`PATCH /v1/appStoreVersionLocalizations/{id}`) from the curated UI fields.
 *
 * Every metadata attribute (What's New, description, keywords, promotional text,
 * marketing / support URLs) is optional and independently settable, so they live
 * in an `updateFields` collection — only the ones the user added are sent, so a
 * PATCH never clobbers a locale field left alone. The localization `id` (from the
 * URL parameter) is echoed into `data.id` as JSON:API requires.
 */
function buildTypedLocalizationData(ctx: IExecuteSingleFunctions): IDataObject {
	const localizationId = ctx.getNodeParameter('appStoreVersionLocalizationId') as string;
	const updateFields = ctx.getNodeParameter('updateFields', {}) as IDataObject;

	const attributes: IDataObject = {};
	for (const key of [
		'whatsNew',
		'description',
		'keywords',
		'promotionalText',
		'marketingUrl',
		'supportUrl',
	]) {
		if (updateFields[key] !== undefined && updateFields[key] !== '') {
			attributes[key] = updateFields[key];
		}
	}

	return {
		type: APP_STORE_VERSION_LOCALIZATION_RESOURCE_TYPE,
		id: localizationId,
		attributes,
	};
}

/** `preSend` hook for the localization Update. */
export async function attachLocalizationUpdateBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const data = resolveMutationData(this, () => buildTypedLocalizationData(this));

	requestOptions.body = { data };
	return requestOptions;
}

// --- Submit for Review: reviewSubmissions ----------------------------------

/**
 * Assemble the typed `data` object for Submit for Review
 * (`POST /v1/reviewSubmissions`): a required `platform` attribute + a required
 * `app` relationship (read from the `targetApp` picker). This creates the
 * submission container; the concrete version is then linked with Add Submission
 * Item.
 */
function buildTypedReviewSubmissionData(ctx: IExecuteSingleFunctions): IDataObject {
	const platform = ctx.getNodeParameter('platform', '') as string;
	const appId = ctx.getNodeParameter('targetApp', '', { extractValue: true }) as string;

	return {
		type: REVIEW_SUBMISSION_RESOURCE_TYPE,
		attributes: { platform },
		relationships: {
			app: {
				data: { type: APP_RESOURCE_TYPE, id: appId },
			},
		},
	};
}

/** `preSend` hook for Submit for Review (create a review submission). */
export async function attachReviewSubmissionBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const data = resolveMutationData(this, () => buildTypedReviewSubmissionData(this));

	requestOptions.body = { data };
	return requestOptions;
}

// --- Add Submission Item: reviewSubmissionItems ----------------------------

/**
 * Assemble the typed `data` object for Add Submission Item
 * (`POST /v1/reviewSubmissionItems`): no attributes, just two relationships —
 * the parent `reviewSubmission` (from `reviewSubmissionId`) and the
 * `appStoreVersion` being submitted (from `appStoreVersionId`).
 */
function buildTypedSubmissionItemData(ctx: IExecuteSingleFunctions): IDataObject {
	const reviewSubmissionId = ctx.getNodeParameter('reviewSubmissionId') as string;
	const versionId = ctx.getNodeParameter('appStoreVersionId') as string;

	return {
		type: REVIEW_SUBMISSION_ITEM_RESOURCE_TYPE,
		relationships: {
			reviewSubmission: {
				data: { type: REVIEW_SUBMISSION_RESOURCE_TYPE, id: reviewSubmissionId },
			},
			appStoreVersion: {
				data: { type: APP_STORE_VERSION_RESOURCE_TYPE, id: versionId },
			},
		},
	};
}

/** `preSend` hook for Add Submission Item. */
export async function attachSubmissionItemBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const data = resolveMutationData(this, () => buildTypedSubmissionItemData(this));

	requestOptions.body = { data };
	return requestOptions;
}

// --- Release: appStoreVersionReleaseRequests -------------------------------

/**
 * Assemble the typed `data` object for Release
 * (`POST /v1/appStoreVersionReleaseRequests`): no attributes, a single
 * `appStoreVersion` relationship pointing at the approved version to release
 * (from `appStoreVersionId`).
 */
function buildTypedReleaseRequestData(ctx: IExecuteSingleFunctions): IDataObject {
	const versionId = ctx.getNodeParameter('appStoreVersionId') as string;

	return {
		type: APP_STORE_VERSION_RELEASE_REQUEST_RESOURCE_TYPE,
		relationships: {
			appStoreVersion: {
				data: { type: APP_STORE_VERSION_RESOURCE_TYPE, id: versionId },
			},
		},
	};
}

/** `preSend` hook for Release (create a release request). */
export async function attachReleaseRequestBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const data = resolveMutationData(this, () => buildTypedReleaseRequestData(this));

	requestOptions.body = { data };
	return requestOptions;
}

// --- Phased Release: appStoreVersionPhasedReleases -------------------------

/**
 * Assemble the typed `data` object for a phased-release write.
 *
 * - **Create** (`POST /v1/appStoreVersionPhasedReleases`): opt a version into a
 *   staged rollout — an optional `phasedReleaseState` attribute + a required
 *   `appStoreVersion` relationship (from `appStoreVersionId`).
 * - **Update** (`PATCH /v1/appStoreVersionPhasedReleases/{id}`): set
 *   `phasedReleaseState` (pause / resume / complete) on the phased release's own
 *   `id` (from `phasedReleaseId`); ASC keys the PATCH off the URL id.
 */
function buildTypedPhasedReleaseData(ctx: IExecuteSingleFunctions, operation: string): IDataObject {
	if (operation === 'createPhasedRelease') {
		const state = (ctx.getNodeParameter('phasedReleaseState', '') as string)?.trim();
		const versionId = ctx.getNodeParameter('appStoreVersionId') as string;

		const data: IDataObject = {
			type: APP_STORE_VERSION_PHASED_RELEASE_RESOURCE_TYPE,
			relationships: {
				appStoreVersion: {
					data: { type: APP_STORE_VERSION_RESOURCE_TYPE, id: versionId },
				},
			},
		};
		if (state) {
			data.attributes = { phasedReleaseState: state };
		}
		return data;
	}

	// updatePhasedRelease
	const phasedReleaseId = ctx.getNodeParameter('phasedReleaseId') as string;
	const state = ctx.getNodeParameter('phasedReleaseState', '') as string;

	return {
		type: APP_STORE_VERSION_PHASED_RELEASE_RESOURCE_TYPE,
		id: phasedReleaseId,
		attributes: { phasedReleaseState: state },
	};
}

/** `preSend` hook shared by phased-release Create and Update. */
export async function attachPhasedReleaseBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const operation = this.getNodeParameter('operation') as string;

	const data = resolveMutationData(this, () => buildTypedPhasedReleaseData(this, operation));

	requestOptions.body = { data };
	return requestOptions;
}
