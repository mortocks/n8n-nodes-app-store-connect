import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

import { resolveMutationData } from '../_shared/inputMode';
import { APP_INFO_LOCALIZATION_RESOURCE_TYPE } from './app.constants';

/**
 * `preSend` hook for Apps Get Many (`GET /v1/apps`) that folds the curated
 * convenience filters into JSON:API `filter[...]` query params.
 *
 * Apps is a top-level collection, so all facets are plain filters. Only filters
 * the user actually set are written, and everything merges onto any existing
 * `qs`, so it composes with the shared `attachQueryOptions` hook. Runs *before*
 * `attachQueryOptions` in the `preSend` chain; both only add keys, so order is
 * immaterial.
 *
 * Filter keys verified against the App Store Connect OpenAPI spec (v4.3):
 * `filter[bundleId]`, `filter[name]`, and `filter[sku]` are all listed on
 * `GET /v1/apps`. ⚠️ Confirm against a live 2xx.
 */
export async function attachAppFilters(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const qs: IDataObject = { ...(requestOptions.qs ?? {}) };

	const bundleId = (this.getNodeParameter('filterBundleId', '') as string)?.trim();
	if (bundleId) {
		qs['filter[bundleId]'] = bundleId;
	}

	const name = (this.getNodeParameter('filterName', '') as string)?.trim();
	if (name) {
		qs['filter[name]'] = name;
	}

	const sku = (this.getNodeParameter('filterSku', '') as string)?.trim();
	if (sku) {
		qs['filter[sku]'] = sku;
	}

	requestOptions.qs = qs;
	return requestOptions;
}

/**
 * Assemble the typed JSON:API `data` object for an app-info localization Update
 * (`PATCH /v1/appInfoLocalizations/{id}`) from the curated UI fields.
 *
 * Every writable attribute is optional and independently settable, so they live
 * in an `updateFields` collection: `name`, `subtitle`, `privacyPolicyUrl`,
 * `privacyPolicyText`, and `privacyChoicesUrl` — the per-locale App Store
 * metadata. Only the attributes the user actually added are sent, so a PATCH
 * never clobbers a field the user left alone. The localization `id` (from the
 * `localizationId` URL parameter) is echoed into `data.id` as JSON:API requires.
 *
 * Only reached in `fields` mode — `resolveMutationData` skips it entirely in
 * JSON mode (see `_shared/inputMode.ts`).
 */
function buildTypedAppInfoLocalizationData(ctx: IExecuteSingleFunctions): IDataObject {
	const localizationId = ctx.getNodeParameter('localizationId') as string;
	const updateFields = ctx.getNodeParameter('updateFields', {}) as IDataObject;

	const attributes: IDataObject = {};
	for (const key of [
		'name',
		'subtitle',
		'privacyPolicyUrl',
		'privacyPolicyText',
		'privacyChoicesUrl',
	] as const) {
		if (updateFields[key] !== undefined) {
			attributes[key] = updateFields[key];
		}
	}

	return {
		type: APP_INFO_LOCALIZATION_RESOURCE_TYPE,
		id: localizationId,
		attributes,
	};
}

/**
 * `preSend` hook for the app-info localization Update.
 *
 * Delegates the "typed UI or raw JSON" decision to the shared
 * `resolveMutationData` helper: in `fields` mode it builds the body from
 * `buildTypedAppInfoLocalizationData`; in `json` mode it sends the user-supplied
 * JSON:API `data` object verbatim (validated to parse and carry a `type`).
 * Either way the node owns the wrapping `{ data }` envelope, URL, method, and
 * auth, and the response flows through the same `ascSingleRequest` + module-D
 * error mapper.
 */
export async function attachAppInfoLocalizationUpdateBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const data = resolveMutationData(this, () => buildTypedAppInfoLocalizationData(this));

	requestOptions.body = { data };
	return requestOptions;
}
