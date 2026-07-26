import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

import { resolveMutationData } from '../_shared/inputMode';
import { extractResourceId } from '../_shared/params';
import { APP_RESOURCE_TYPE } from '../../methods/apps';
import { BETA_GROUP_RESOURCE_TYPE } from './betaGroup.constants';

/**
 * `preSend` hook for Get Many (`GET /v1/betaGroups`) that folds the curated
 * Target App convenience filter into a JSON:API `filter[app]` query param.
 *
 * Beta Groups is a *top-level* collection, so the app is expressed as
 * `filter[app]=<id>` rather than a URL segment. Only writes the filter when the
 * user actually chose an app, and merges onto any existing `qs`, so it composes
 * with the shared `attachQueryOptions` hook (arbitrary `filter[key]`, sparse
 * fieldsets, include, sort). Runs *before* `attachQueryOptions` in the `preSend`
 * chain; both only add keys, so order is immaterial.
 *
 * ⚠️ `filter[app]` is doc-derived — confirm against a live 2xx.
 */
export async function attachBetaGroupFilters(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const qs: IDataObject = { ...(requestOptions.qs ?? {}) };

	const appId = extractResourceId(this, 'targetApp');
	if (appId) {
		qs['filter[app]'] = appId;
	}

	const name = (this.getNodeParameter('filterName', '') as string)?.trim();
	if (name) {
		qs['filter[name]'] = name;
	}

	// Optional boolean filters use the tri-state Any/Yes/No dropdown; the value is
	// already `'true'` / `'false'` (or empty for Any, which we skip).
	const isInternalGroup = this.getNodeParameter('filterIsInternalGroup', '') as string;
	if (isInternalGroup) {
		qs['filter[isInternalGroup]'] = isInternalGroup;
	}

	const publicLinkEnabled = this.getNodeParameter('filterPublicLinkEnabled', '') as string;
	if (publicLinkEnabled) {
		qs['filter[publicLinkEnabled]'] = publicLinkEnabled;
	}

	requestOptions.qs = qs;
	return requestOptions;
}

/**
 * Copy the optional beta-group attributes the user set into `attributes`. Shared
 * by Create (from the `additionalFields` collection) and Update (from the
 * `updateFields` collection) — each is only written when present, so a PATCH
 * never clobbers an attribute the user left alone.
 */
function assignBetaGroupAttributes(attributes: IDataObject, source: IDataObject): void {
	if (source.publicLinkEnabled !== undefined) {
		attributes.publicLinkEnabled = source.publicLinkEnabled;
	}
	if (source.publicLinkLimitEnabled !== undefined) {
		attributes.publicLinkLimitEnabled = source.publicLinkLimitEnabled;
	}
	if (source.publicLinkLimit !== undefined) {
		attributes.publicLinkLimit = source.publicLinkLimit;
	}
	if (source.feedbackEnabled !== undefined) {
		attributes.feedbackEnabled = source.feedbackEnabled;
	}
}

/**
 * Assemble the typed JSON:API `data` object for a beta-group write from the
 * curated UI fields.
 *
 * - **Create** (`POST /v1/betaGroups`): required `name` attribute + any optional
 *   attributes (`additionalFields`) + a required `app` relationship pointing at
 *   the app the group belongs to (read from the `targetApp` picker).
 * - **Update** (`PATCH /v1/betaGroups/{id}`): only the attributes the user set
 *   (`updateFields`, including an optional `name`) + the group's own `id` (read
 *   from the `betaGroup` picker); ASC keys the PATCH off the URL id.
 *
 * Only reached in `fields` mode — `resolveMutationData` skips it entirely in
 * JSON mode (see `_shared/inputMode.ts`).
 */
function buildTypedBetaGroupData(ctx: IExecuteSingleFunctions, operation: string): IDataObject {
	const attributes: IDataObject = {};

	if (operation === 'create') {
		attributes.name = ctx.getNodeParameter('name', '') as string;
		const additionalFields = ctx.getNodeParameter('additionalFields', {}) as IDataObject;
		assignBetaGroupAttributes(attributes, additionalFields);

		const appId = ctx.getNodeParameter('targetApp', '', { extractValue: true }) as string;
		return {
			type: BETA_GROUP_RESOURCE_TYPE,
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
	if (updateFields.name !== undefined) {
		attributes.name = updateFields.name;
	}
	assignBetaGroupAttributes(attributes, updateFields);

	const betaGroupId = ctx.getNodeParameter('betaGroup', '', { extractValue: true }) as string;
	return {
		type: BETA_GROUP_RESOURCE_TYPE,
		id: betaGroupId,
		attributes,
	};
}

/**
 * `preSend` hook shared by beta-group Create and Update.
 *
 * Delegates the "typed UI or raw JSON" decision to the shared
 * `resolveMutationData` helper: in `fields` mode it builds the body from
 * `buildTypedBetaGroupData`; in `json` mode it sends the user-supplied JSON:API
 * `data` object verbatim (validated to parse and carry a `type`). Either way the
 * node owns the wrapping `{ data }` envelope, URL, method, and auth, and the
 * response flows through the same `ascSingleRequest` + module-D error mapper.
 */
export async function attachBetaGroupBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const operation = this.getNodeParameter('operation') as string;

	const data = resolveMutationData(this, () => buildTypedBetaGroupData(this, operation));

	requestOptions.body = { data };
	return requestOptions;
}
