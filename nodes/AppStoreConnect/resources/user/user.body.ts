import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

import { resolveMutationData } from '../_shared/inputMode';
import { extractResourceId } from '../_shared/params';
import { USER_RESOURCE_TYPE } from './user.constants';

/**
 * `preSend` hook for Users Get Many (`GET /v1/users`) that folds the curated
 * convenience filters into JSON:API `filter[...]` query params.
 *
 * Users is a top-level collection, so all facets are plain filters. Only filters
 * the user actually set are written, and everything merges onto any existing
 * `qs`, so it composes with the shared `attachQueryOptions` hook. Runs *before*
 * `attachQueryOptions` in the `preSend` chain; both only add keys, so order is
 * immaterial.
 *
 * Filter keys verified against the App Store Connect OpenAPI spec (v4.3):
 * `filter[username]`, `filter[roles]`, and `filter[visibleApps]` are all listed
 * on `GET /v1/users`. `filter[roles]` takes a comma-separated list of ASC role
 * strings (e.g. `ADMIN,DEVELOPER`) — the typed multi-select is joined into that
 * form here; `filter[visibleApps]` takes an app id, extracted from the Visible
 * App resourceLocator. ⚠️ Confirm against a live 2xx.
 */
export async function attachUserFilters(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const qs: IDataObject = { ...(requestOptions.qs ?? {}) };

	const username = (this.getNodeParameter('filterUsername', '') as string)?.trim();
	if (username) {
		qs['filter[username]'] = username;
	}

	const roles = this.getNodeParameter('filterRoles', []) as string[];
	if (roles.length) {
		qs['filter[roles]'] = roles.join(',');
	}

	const visibleApp = extractResourceId(this, 'visibleApp');
	if (visibleApp) {
		qs['filter[visibleApps]'] = visibleApp;
	}

	requestOptions.qs = qs;
	return requestOptions;
}

/**
 * Copy the optional user attributes the user set into `attributes`. Written only
 * when present, so a PATCH never clobbers an attribute the caller left alone —
 * the same "sparse update" discipline as the Beta Groups body builder.
 */
function assignUserAttributes(attributes: IDataObject, source: IDataObject): void {
	if (source.allAppsVisible !== undefined) {
		attributes.allAppsVisible = source.allAppsVisible;
	}
	if (source.provisioningAllowed !== undefined) {
		attributes.provisioningAllowed = source.provisioningAllowed;
	}
}

/**
 * Assemble the typed JSON:API `data` object for a user Update Roles write
 * (`PATCH /v1/users/{id}`) from the curated UI fields.
 *
 * The `roles` multi-select (backed by the shared `getUserRoles` loadOptions) is
 * the primary attribute; ASC replaces the user's full role set with the array
 * sent, so it is always written. Optional `allAppsVisible` / `provisioningAllowed`
 * ride along via the Additional Fields collection. The user's own `id` (read
 * from `userId`) keys the PATCH — ASC keys off the URL id, so no relationship is
 * needed.
 *
 * Only reached in `fields` mode — `resolveMutationData` skips it entirely in
 * JSON mode (see `_shared/inputMode.ts`).
 */
function buildTypedUserData(ctx: IExecuteSingleFunctions): IDataObject {
	const roles = ctx.getNodeParameter('roles', []) as string[];
	const attributes: IDataObject = { roles };

	const additionalFields = ctx.getNodeParameter('additionalFields', {}) as IDataObject;
	assignUserAttributes(attributes, additionalFields);

	const userId = ctx.getNodeParameter('userId') as string;
	return {
		type: USER_RESOURCE_TYPE,
		id: userId,
		attributes,
	};
}

/**
 * `preSend` hook for the user Update Roles operation.
 *
 * Delegates the "typed UI or raw JSON" decision to the shared
 * `resolveMutationData` helper: in `fields` mode it builds the body from
 * `buildTypedUserData`; in `json` mode it sends the user-supplied JSON:API
 * `data` object verbatim (validated to parse and carry a `type`). Either way the
 * node owns the wrapping `{ data }` envelope, URL, method, and auth, and the
 * response flows through the same `ascSingleRequest` + module-D error mapper.
 */
export async function attachUserBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const data = resolveMutationData(this, () => buildTypedUserData(this));

	requestOptions.body = { data };
	return requestOptions;
}
