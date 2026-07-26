import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

import { resolveMutationData } from '../_shared/inputMode';
import {
	CUSTOMER_REVIEW_RESOURCE_TYPE,
	CUSTOMER_REVIEW_RESPONSE_RESOURCE_TYPE,
} from './customerReview.constants';

/**
 * `preSend` hook for Get Many (`GET /v1/apps/{id}/customerReviews`) that folds the
 * curated convenience filters (Rating, Territory) into JSON:API `filter[...]`
 * query params.
 *
 * Customer Reviews is app-scoped via the URL, so the app is *not* a filter here —
 * only the review-level facets are. Only filters the user actually set are
 * written, and everything merges onto any existing `qs`, so it composes with the
 * shared `attachQueryOptions` hook. Runs *before* `attachQueryOptions` in the
 * `preSend` chain; both only add keys, so order is immaterial.
 *
 * ⚠️ `filter[rating]` / `filter[territory]` are doc-derived (verified against the
 * App Store Connect OpenAPI spec) — confirm against a live 2xx.
 */
export async function attachCustomerReviewFilters(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const qs: IDataObject = { ...(requestOptions.qs ?? {}) };

	const rating = (this.getNodeParameter('filterRating', '') as string)?.trim();
	if (rating) {
		qs['filter[rating]'] = rating;
	}

	const territory = (this.getNodeParameter('filterTerritory', '') as string)?.trim();
	if (territory) {
		qs['filter[territory]'] = territory;
	}

	requestOptions.qs = qs;
	return requestOptions;
}

/**
 * Assemble the typed JSON:API `data` object for a review-response write from the
 * curated UI fields.
 *
 * - **Create** (`POST /v1/customerReviewResponses`): `responseBody` attribute +
 *   a `review` relationship pointing at the customer review being answered
 *   (read from the `reviewId` parameter).
 * - **Update** (`PATCH /v1/customerReviewResponses/{id}`): `responseBody`
 *   attribute + the response's own `id` (read from `responseId`); ASC keys the
 *   PATCH off the URL id, so no relationship is needed.
 *
 * Only reached in `fields` mode — `resolveMutationData` skips it entirely in
 * JSON mode (see `_shared/inputMode.ts`).
 */
function buildTypedResponseData(ctx: IExecuteSingleFunctions, operation: string): IDataObject {
	const responseBody = ctx.getNodeParameter('responseBody', '') as string;

	const data: IDataObject = {
		type: CUSTOMER_REVIEW_RESPONSE_RESOURCE_TYPE,
		attributes: {
			responseBody,
		},
	};

	if (operation === 'updateResponse') {
		data.id = ctx.getNodeParameter('responseId') as string;
	} else {
		const reviewId = ctx.getNodeParameter('reviewId') as string;
		data.relationships = {
			review: {
				data: { type: CUSTOMER_REVIEW_RESOURCE_TYPE, id: reviewId },
			},
		};
	}

	return data;
}

/**
 * `preSend` hook shared by Create Response and Update Response.
 *
 * Delegates the "typed UI or raw JSON" decision to the shared
 * `resolveMutationData` helper (module: `_shared/inputMode.ts`): in `fields`
 * mode it builds the body from `buildTypedResponseData`; in `json` mode it
 * sends the user-supplied JSON:API `data` object verbatim (validated to parse
 * and carry a `type` before the request). Either way the node owns the wrapping
 * `{ data }` envelope, URL, method, and auth.
 *
 * This is the node's first mutation, so both paths are exercised end-to-end.
 */
export async function attachCustomerReviewResponseBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const operation = this.getNodeParameter('operation') as string;

	const data = resolveMutationData(this, () => buildTypedResponseData(this, operation));

	requestOptions.body = { data };
	return requestOptions;
}
