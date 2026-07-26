import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

import { resolveMutationData } from '../_shared/inputMode';
import { extractResourceId } from '../_shared/params';
import { BETA_GROUP_RESOURCE_TYPE } from '../betaGroup/betaGroup.constants';
import { BETA_TESTER_RESOURCE_TYPE } from './betaTester.constants';

/**
 * `preSend` hook for Get Many (`GET /v1/betaTesters`) that folds the curated
 * convenience filters (Target App, Beta Group, Email) into JSON:API
 * `filter[...]` query params.
 *
 * Beta Testers is a *top-level* collection, so app/group are expressed as
 * `filter[apps]` / `filter[betaGroups]` rather than URL segments. Only filters
 * the user actually set are written, and everything merges onto any existing
 * `qs`, so it composes with the shared `attachQueryOptions` hook.
 *
 * ⚠️ `filter[apps]` / `filter[betaGroups]` / `filter[email]` / `filter[firstName]`
 * / `filter[lastName]` / `filter[inviteType]` are doc-derived (verified against
 * the App Store Connect OpenAPI spec) — confirm against a live 2xx.
 */
export async function attachBetaTesterFilters(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const qs: IDataObject = { ...(requestOptions.qs ?? {}) };

	const appId = extractResourceId(this, 'targetApp');
	if (appId) {
		qs['filter[apps]'] = appId;
	}

	const betaGroupId = extractResourceId(this, 'betaGroup');
	if (betaGroupId) {
		qs['filter[betaGroups]'] = betaGroupId;
	}

	const email = (this.getNodeParameter('filterEmail', '') as string)?.trim();
	if (email) {
		qs['filter[email]'] = email;
	}

	const firstName = (this.getNodeParameter('filterFirstName', '') as string)?.trim();
	if (firstName) {
		qs['filter[firstName]'] = firstName;
	}

	const lastName = (this.getNodeParameter('filterLastName', '') as string)?.trim();
	if (lastName) {
		qs['filter[lastName]'] = lastName;
	}

	const inviteType = this.getNodeParameter('filterInviteType', '') as string;
	if (inviteType) {
		qs['filter[inviteType]'] = inviteType;
	}

	requestOptions.qs = qs;
	return requestOptions;
}

/**
 * Assemble the typed JSON:API `data` object for a beta-tester Create/invite
 * (`POST /v1/betaTesters`) from the curated UI fields.
 *
 * The required `email` plus optional `firstName` / `lastName` attributes, and a
 * `betaGroups` relationship pointing at the group to add the tester to (read
 * from the `betaGroup` picker). Creating a tester against an external group
 * sends the TestFlight invite. The relationship value is a JSON:API *array* of
 * resource identifiers, as ASC's to-many relationship requires.
 *
 * Only reached in `fields` mode — `resolveMutationData` skips it entirely in
 * JSON mode (see `_shared/inputMode.ts`).
 */
function buildTypedBetaTesterData(ctx: IExecuteSingleFunctions): IDataObject {
	const email = ctx.getNodeParameter('email', '') as string;
	const firstName = (ctx.getNodeParameter('firstName', '') as string)?.trim();
	const lastName = (ctx.getNodeParameter('lastName', '') as string)?.trim();

	const attributes: IDataObject = { email };
	if (firstName) {
		attributes.firstName = firstName;
	}
	if (lastName) {
		attributes.lastName = lastName;
	}

	const betaGroupId = ctx.getNodeParameter('betaGroup', '', { extractValue: true }) as string;

	return {
		type: BETA_TESTER_RESOURCE_TYPE,
		attributes,
		relationships: {
			betaGroups: {
				data: [{ type: BETA_GROUP_RESOURCE_TYPE, id: betaGroupId }],
			},
		},
	};
}

/**
 * `preSend` hook for beta-tester Create/invite.
 *
 * Delegates the "typed UI or raw JSON" decision to the shared
 * `resolveMutationData` helper: in `fields` mode it builds the body from
 * `buildTypedBetaTesterData`; in `json` mode it sends the user-supplied JSON:API
 * `data` object verbatim (validated to parse and carry a `type`). Either way the
 * node owns the wrapping `{ data }` envelope, URL, method, and auth.
 */
export async function attachBetaTesterBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const data = resolveMutationData(this, () => buildTypedBetaTesterData(this));

	requestOptions.body = { data };
	return requestOptions;
}

/**
 * `preSend` hook shared by Add to Group and Remove from Group.
 *
 * These are JSON:API *relationship-linkage* writes — `POST` (add) or `DELETE`
 * (remove) on `/v1/betaGroups/{groupId}/relationships/betaTesters` — whose body
 * is a to-many linkage: `{ data: [ { type: "betaTesters", id } ] }` (an *array*
 * of resource identifiers, not a full resource object). The group id lives in
 * the URL (`betaGroup` picker); the tester id (`betaTesterId`) becomes the sole
 * linkage entry. Unlike Create/Update these carry no typed attributes, so they
 * do not use the Input Mode escape hatch — the linkage shape is fixed.
 */
export async function attachBetaTesterGroupLinkage(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const testerId = this.getNodeParameter('betaTesterId') as string;

	requestOptions.body = {
		data: [{ type: BETA_TESTER_RESOURCE_TYPE, id: testerId }],
	};
	return requestOptions;
}
