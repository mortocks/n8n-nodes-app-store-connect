import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

import { resolveMutationData } from '../_shared/inputMode';
import { extractResourceId } from '../_shared/params';
import { USER_INVITATION_RESOURCE_TYPE } from './userInvitation.constants';

/**
 * `preSend` hook for User Invitations Get Many (`GET /v1/userInvitations`) that
 * folds the curated convenience filters into JSON:API `filter[...]` query params.
 *
 * User Invitations is a top-level collection, so all facets are plain filters.
 * Only filters the user actually set are written, and everything merges onto any
 * existing `qs`, so it composes with the shared `attachQueryOptions` hook. Runs
 * *before* `attachQueryOptions` in the `preSend` chain; both only add keys, so
 * order is immaterial.
 *
 * Filter keys verified against the App Store Connect OpenAPI spec (v4.3):
 * `filter[email]`, `filter[roles]`, and `filter[visibleApps]` are all listed on
 * `GET /v1/userInvitations`. `filter[roles]` takes a comma-separated list of ASC
 * role strings (e.g. `ADMIN,DEVELOPER`) — the typed multi-select is joined into
 * that form here; `filter[visibleApps]` takes an app id, extracted from the
 * Visible App resourceLocator. ⚠️ Confirm against a live 2xx.
 */
export async function attachUserInvitationFilters(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const qs: IDataObject = { ...(requestOptions.qs ?? {}) };

	const email = (this.getNodeParameter('filterEmail', '') as string)?.trim();
	if (email) {
		qs['filter[email]'] = email;
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
 * Copy the optional invitation attributes the user set into `attributes`.
 * Written only when present, so the created invitation carries exactly the
 * fields the caller chose — the same "sparse" discipline as the other body
 * builders.
 */
function assignInvitationAttributes(attributes: IDataObject, source: IDataObject): void {
	if (source.allAppsVisible !== undefined) {
		attributes.allAppsVisible = source.allAppsVisible;
	}
	if (source.provisioningAllowed !== undefined) {
		attributes.provisioningAllowed = source.provisioningAllowed;
	}
}

/**
 * Assemble the typed JSON:API `data` object for a Create invitation write
 * (`POST /v1/userInvitations`) from the curated UI fields.
 *
 * Required attributes: `email`, `firstName`, `lastName`, and `roles` (the shared
 * `getUserRoles` multi-select). Optional `allAppsVisible` / `provisioningAllowed`
 * ride along via the Additional Fields collection. No `id` — the server mints
 * the invitation.
 *
 * Only reached in `fields` mode — `resolveMutationData` skips it entirely in
 * JSON mode (see `_shared/inputMode.ts`).
 */
function buildTypedInvitationData(ctx: IExecuteSingleFunctions): IDataObject {
	const attributes: IDataObject = {
		email: ctx.getNodeParameter('email', '') as string,
		firstName: ctx.getNodeParameter('firstName', '') as string,
		lastName: ctx.getNodeParameter('lastName', '') as string,
		roles: ctx.getNodeParameter('roles', []) as string[],
	};

	const additionalFields = ctx.getNodeParameter('additionalFields', {}) as IDataObject;
	assignInvitationAttributes(attributes, additionalFields);

	return {
		type: USER_INVITATION_RESOURCE_TYPE,
		attributes,
	};
}

/**
 * `preSend` hook for the user-invitation Create operation.
 *
 * Delegates the "typed UI or raw JSON" decision to the shared
 * `resolveMutationData` helper: in `fields` mode it builds the body from
 * `buildTypedInvitationData`; in `json` mode it sends the user-supplied JSON:API
 * `data` object verbatim (validated to parse and carry a `type`). Either way the
 * node owns the wrapping `{ data }` envelope, URL, method, and auth, and the
 * response flows through the same `ascSingleRequest` + module-D error mapper.
 */
export async function attachUserInvitationBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const data = resolveMutationData(this, () => buildTypedInvitationData(this));

	requestOptions.body = { data };
	return requestOptions;
}
