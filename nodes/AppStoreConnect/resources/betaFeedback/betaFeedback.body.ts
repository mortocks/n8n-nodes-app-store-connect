import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

/**
 * `preSend` hook for Beta Feedback Get Many
 * (`GET /v1/apps/{id}/betaFeedback{Crash,Screenshot}Submissions`) that folds the
 * curated convenience filters into JSON:API `filter[...]` query params.
 *
 * Beta feedback is app-scoped via the URL, so the app is *not* a filter here —
 * only the submission-level facets are. The crash and screenshot collections
 * expose the **same** documented filter set (device/app platform, device model,
 * OS version, build), so one hook serves both kinds. Only filters the user
 * actually set are written, and everything merges onto any existing `qs`, so it
 * composes with the shared `attachQueryOptions` hook. Runs *before*
 * `attachQueryOptions` in the `preSend` chain; both only add keys, so order is
 * immaterial.
 *
 * Filter keys verified against the App Store Connect OpenAPI spec (v4.3):
 * `filter[devicePlatform]`, `filter[appPlatform]` (both `Platform` enums),
 * `filter[deviceModel]`, `filter[osVersion]`, and `filter[build]` (a build id)
 * are all listed on both the crash and screenshot to-many-related endpoints.
 * ⚠️ Confirm against a live 2xx.
 */
export async function attachBetaFeedbackFilters(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const qs: IDataObject = { ...(requestOptions.qs ?? {}) };

	const devicePlatform = (this.getNodeParameter('filterDevicePlatform', '') as string)?.trim();
	if (devicePlatform) {
		qs['filter[devicePlatform]'] = devicePlatform;
	}

	const appPlatform = (this.getNodeParameter('filterAppPlatform', '') as string)?.trim();
	if (appPlatform) {
		qs['filter[appPlatform]'] = appPlatform;
	}

	const deviceModel = (this.getNodeParameter('filterDeviceModel', '') as string)?.trim();
	if (deviceModel) {
		qs['filter[deviceModel]'] = deviceModel;
	}

	const osVersion = (this.getNodeParameter('filterOsVersion', '') as string)?.trim();
	if (osVersion) {
		qs['filter[osVersion]'] = osVersion;
	}

	const build = (this.getNodeParameter('filterBuild', '') as string)?.trim();
	if (build) {
		qs['filter[build]'] = build;
	}

	requestOptions.qs = qs;
	return requestOptions;
}
