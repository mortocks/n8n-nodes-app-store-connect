import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

import { resolveMutationData } from '../_shared/inputMode';
import { extractResourceId } from '../_shared/params';
import { BUILD_RESOURCE_TYPE } from './build.constants';

/**
 * `preSend` hook for Get Many (`GET /v1/builds`) that folds the curated
 * convenience filters (Target App, Version, Processing State, Pre-Release
 * Version) into JSON:API `filter[...]` query params.
 *
 * Builds is a *top-level* collection (unlike app-scoped Customer Reviews), so
 * the app is expressed as `filter[app]=<id>` rather than a URL segment — hence
 * this hook rather than a URL expression. Only filters the user actually set are
 * written, and everything merges onto any existing `qs`, so it composes with the
 * shared `attachQueryOptions` hook (which handles arbitrary `filter[key]`,
 * sparse fieldsets, include, sort). Runs *before* `attachQueryOptions` in the
 * `preSend` chain; both only add keys, so order is immaterial.
 */
export async function attachBuildFilters(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const qs: IDataObject = { ...(requestOptions.qs ?? {}) };

	const appId = extractResourceId(this, 'targetApp');
	if (appId) {
		qs['filter[app]'] = appId;
	}

	const version = (this.getNodeParameter('filterVersion', '') as string)?.trim();
	if (version) {
		qs['filter[version]'] = version;
	}

	const processingState = (this.getNodeParameter('filterProcessingState', '') as string)?.trim();
	if (processingState) {
		qs['filter[processingState]'] = processingState;
	}

	const preReleaseVersion = (
		this.getNodeParameter('filterPreReleaseVersion', '') as string
	)?.trim();
	if (preReleaseVersion) {
		qs['filter[preReleaseVersion]'] = preReleaseVersion;
	}

	// Optional boolean filter via the tri-state Any/Yes/No dropdown; the value is
	// already `'true'` / `'false'` (or empty for Any, which we skip).
	const expired = this.getNodeParameter('filterExpired', '') as string;
	if (expired) {
		qs['filter[expired]'] = expired;
	}

	requestOptions.qs = qs;
	return requestOptions;
}

/**
 * Assemble the typed JSON:API `data` object for a build Update
 * (`PATCH /v1/builds/{id}`) from the curated UI fields.
 *
 * Both writable attributes are optional and independently settable, so they
 * live in an `updateFields` collection: `expired` (expire an old build) and
 * `usesNonExemptEncryption` (declare the encryption compliance answer). Only the
 * attributes the user actually added are sent, so a PATCH never clobbers an
 * attribute the user left alone. The build `id` (from the `buildId` URL
 * parameter) is echoed into `data.id` as JSON:API requires.
 *
 * Only reached in `fields` mode — `resolveMutationData` skips it entirely in
 * JSON mode (see `_shared/inputMode.ts`).
 */
function buildTypedBuildData(ctx: IExecuteSingleFunctions): IDataObject {
	const buildId = ctx.getNodeParameter('buildId') as string;
	const updateFields = ctx.getNodeParameter('updateFields', {}) as IDataObject;

	const attributes: IDataObject = {};
	if (updateFields.expired !== undefined) {
		attributes.expired = updateFields.expired;
	}
	if (updateFields.usesNonExemptEncryption !== undefined) {
		attributes.usesNonExemptEncryption = updateFields.usesNonExemptEncryption;
	}

	return {
		type: BUILD_RESOURCE_TYPE,
		id: buildId,
		attributes,
	};
}

/**
 * `preSend` hook for build Update.
 *
 * Delegates the "typed UI or raw JSON" decision to the shared
 * `resolveMutationData` helper: in `fields` mode it builds the body from
 * `buildTypedBuildData`; in `json` mode it sends the user-supplied JSON:API
 * `data` object verbatim (validated to parse and carry a `type`). Either way the
 * node owns the wrapping `{ data }` envelope, URL, method, and auth, and the
 * response flows through the same `ascSingleRequest` + module-D error mapper.
 */
export async function attachBuildUpdateBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const data = resolveMutationData(this, () => buildTypedBuildData(this));

	requestOptions.body = { data };
	return requestOptions;
}
